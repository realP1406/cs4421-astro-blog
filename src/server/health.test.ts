import { describe, expect, it, vi } from 'vitest';
import { buildLivenessReport, createReadinessChecker, type ReadinessOptions } from './health';

const info = { version: '1.2.3', commit: 'abc1234' };

// A stand-in for fetch(). Every call is recorded so tests can count outbound requests.
function fakeFetch(status = 200) {
	return vi.fn<typeof fetch>(async () => new Response('{}', { status }));
}

// A fetch that never answers on its own and fails when the abort signal fires, like the real one.
function hangingFetch() {
	return vi.fn<typeof fetch>(
		(_input, init) =>
			new Promise<Response>((_resolve, reject) => {
				init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
			}),
	);
}

function makeChecker(overrides: Partial<ReadinessOptions> = {}) {
	return createReadinessChecker({
		startedAt: 0,
		info,
		supabaseUrl: 'https://project.supabase.co',
		apiKey: 'sb_publishable_secret_key',
		fetchImpl: fakeFetch(),
		cacheTtlMs: 0,
		...overrides,
	});
}

describe('buildLivenessReport', () => {
	it('reports ok with uptime, version and memory', () => {
		const report = buildLivenessReport({ startedAt: 1_000, info, now: 13_500, rssBytes: 100 * 1_048_576 });
		expect(report).toEqual({
			status: 'ok',
			version: '1.2.3',
			commit: 'abc1234',
			uptimeSeconds: 12.5,
			timestamp: new Date(13_500).toISOString(),
			memoryMb: 100,
		});
	});

	it('works without any options beyond the start time and version', () => {
		const report = buildLivenessReport({ startedAt: Date.now() - 2000, info });
		expect(report.status).toBe('ok');
		expect(report.uptimeSeconds).toBeGreaterThanOrEqual(2);
		expect(report.memoryMb).toBeGreaterThan(0);
	});
});

describe('createReadinessChecker: healthy', () => {
	it('is ready (200) when config is present and Supabase answers', async () => {
		const { httpStatus, body } = await makeChecker()();
		expect(httpStatus).toBe(200);
		expect(body.status).toBe('ready');
		expect(body.checks.config.status).toBe('ok');
		expect(body.checks.lifecycle.status).toBe('ok');
		expect(body.checks.supabase.status).toBe('ok');
	});

	it('includes version, commit and uptime', async () => {
		const { body } = await makeChecker({ startedAt: 0, now: () => 5_000 })();
		expect(body).toMatchObject({ version: '1.2.3', commit: 'abc1234', uptimeSeconds: 5 });
	});

	it('calls the Supabase health endpoint with the key, tolerating a trailing slash', async () => {
		const fetchImpl = fakeFetch();
		await makeChecker({ fetchImpl, supabaseUrl: 'https://project.supabase.co/' })();
		const [url, init] = fetchImpl.mock.calls[0];
		expect(url).toBe('https://project.supabase.co/auth/v1/health');
		expect((init?.headers as Record<string, string>).apikey).toBe('sb_publishable_secret_key');
	});
});

describe('createReadinessChecker: Supabase problems', () => {
	it.each([500, 502, 503])('is degraded but still 200 when Supabase returns %s', async (status) => {
		const { httpStatus, body } = await makeChecker({ fetchImpl: fakeFetch(status) })();
		expect(httpStatus).toBe(200);
		expect(body.status).toBe('degraded');
		expect(body.checks.supabase).toMatchObject({ status: 'fail', critical: false, message: `HTTP ${status}` });
	});

	it('is degraded when Supabase is unreachable', async () => {
		const fetchImpl = vi.fn<typeof fetch>(async () => {
			throw new TypeError('fetch failed: getaddrinfo ENOTFOUND project.supabase.co');
		});
		const { httpStatus, body } = await makeChecker({ fetchImpl })();
		expect(httpStatus).toBe(200);
		expect(body.status).toBe('degraded');
		expect(body.checks.supabase.message).toBe('unreachable');
	});

	it('is degraded when Supabase is too slow, and gives up after the timeout', async () => {
		const { httpStatus, body } = await makeChecker({ fetchImpl: hangingFetch(), timeoutMs: 20 })();
		expect(httpStatus).toBe(200);
		expect(body.status).toBe('degraded');
		expect(body.checks.supabase.message).toBe('timeout after 20ms');
	});

	it.each([401, 403])('is NOT ready (503) when Supabase rejects the key with %s', async (status) => {
		const { httpStatus, body } = await makeChecker({ fetchImpl: fakeFetch(status) })();
		expect(httpStatus).toBe(503);
		expect(body.status).toBe('not_ready');
		expect(body.checks.supabase).toMatchObject({ status: 'fail', critical: true });
		expect(body.checks.supabase.message).toContain(String(status));
	});

	it('treats an outage as critical when requireSupabase is on', async () => {
		const { httpStatus, body } = await makeChecker({ fetchImpl: fakeFetch(500), requireSupabase: true })();
		expect(httpStatus).toBe(503);
		expect(body.status).toBe('not_ready');
		expect(body.checks.supabase.critical).toBe(true);
	});

	it('does not leak the URL, the key or raw error text', async () => {
		const fetchImpl = vi.fn<typeof fetch>(async () => {
			throw new TypeError('connect ECONNREFUSED https://project.supabase.co sb_publishable_secret_key');
		});
		const { body } = await makeChecker({ fetchImpl })();
		const text = JSON.stringify(body);
		expect(text).not.toContain('sb_publishable_secret_key');
		expect(text).not.toContain('project.supabase.co');
		expect(text).not.toContain('ECONNREFUSED');
	});
});

describe('createReadinessChecker: critical local checks', () => {
	it.each([
		['URL', { supabaseUrl: undefined }],
		['key', { apiKey: undefined }],
		['URL (empty string)', { supabaseUrl: '' }],
	] as [string, Partial<ReadinessOptions>][])('is NOT ready when the Supabase %s is missing, without calling Supabase', async (_label, overrides) => {
		const fetchImpl = fakeFetch();
		const { httpStatus, body } = await makeChecker({ ...overrides, fetchImpl })();
		expect(httpStatus).toBe(503);
		expect(body.status).toBe('not_ready');
		expect(body.checks.config).toMatchObject({ status: 'fail', critical: true });
		expect(body.checks.supabase).toBeUndefined();
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it('is NOT ready while shutting down, without calling Supabase', async () => {
		const fetchImpl = fakeFetch();
		const { httpStatus, body } = await makeChecker({ fetchImpl, isShuttingDown: () => true })();
		expect(httpStatus).toBe(503);
		expect(body.checks.lifecycle).toMatchObject({ status: 'fail', critical: true, message: 'shutting down' });
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it('goes from ready to not ready when shutdown starts', async () => {
		let draining = false;
		const check = makeChecker({ isShuttingDown: () => draining });
		expect((await check()).httpStatus).toBe(200);
		draining = true;
		expect((await check()).httpStatus).toBe(503);
	});
});

describe('createReadinessChecker: caching', () => {
	it('reuses a recent Supabase result instead of calling again', async () => {
		let clock = 1_000;
		const fetchImpl = fakeFetch();
		const check = makeChecker({ fetchImpl, cacheTtlMs: 5_000, now: () => clock });
		await check();
		clock += 4_000;
		await check();
		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});

	it('calls Supabase again once the cache has expired', async () => {
		let clock = 1_000;
		const fetchImpl = fakeFetch();
		const check = makeChecker({ fetchImpl, cacheTtlMs: 5_000, now: () => clock });
		await check();
		clock += 5_001;
		await check();
		expect(fetchImpl).toHaveBeenCalledTimes(2);
	});

	it('shares one call between requests that arrive at the same time', async () => {
		const fetchImpl = fakeFetch();
		const check = makeChecker({ fetchImpl, cacheTtlMs: 0 });
		await Promise.all([check(), check(), check()]);
		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});

	it('still reports shutdown immediately even when the Supabase result is cached', async () => {
		let draining = false;
		const check = makeChecker({ cacheTtlMs: 60_000, isShuttingDown: () => draining });
		await check();
		draining = true;
		expect((await check()).httpStatus).toBe(503);
	});
});
