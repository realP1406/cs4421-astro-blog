// HTTP checks for a running server. Used on its own after a deploy, and by smoke.mjs for the local container.
//
//   node scripts/smoke-http.mjs http://localhost:4321
//   node scripts/smoke-http.mjs https://your-site.example --expect-version 1.2.0
import { pathToFileURL } from 'node:url';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitUntilUp(baseUrl, timeoutMs) {
	const deadline = Date.now() + timeoutMs;
	let lastError = 'no response';
	while (Date.now() < deadline) {
		try {
			const response = await fetch(`${baseUrl}/api/livez`, { signal: AbortSignal.timeout(3000) });
			if (response.ok) return;
			lastError = `HTTP ${response.status}`;
		} catch (error) {
			lastError = error instanceof Error ? error.message : String(error);
		}
		await sleep(1000);
	}
	throw new Error(`Server did not come up within ${timeoutMs / 1000}s (last error: ${lastError})`);
}

export async function runHttpChecks({ baseUrl, expectVersion, startupTimeoutMs = 60_000, log = console.log }) {
	const base = baseUrl.replace(/\/+$/, '');
	const results = [];
	const check = async (name, fn) => {
		try {
			await fn();
			results.push({ name, ok: true });
			log(`  PASS  ${name}`);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			results.push({ name, ok: false, message });
			log(`  FAIL  ${name}: ${message}`);
		}
	};
	const expect = (condition, message) => {
		if (!condition) throw new Error(message);
	};
	const get = (path) => fetch(`${base}${path}`, { signal: AbortSignal.timeout(8000) });

	await waitUntilUp(base, startupTimeoutMs);

	await check('/api/livez returns 200 and status ok', async () => {
		const response = await get('/api/livez');
		expect(response.status === 200, `HTTP ${response.status}`);
		expect((await response.json()).status === 'ok', 'status is not "ok"');
	});

	await check('/api/health (lab endpoint) returns 200', async () => {
		const response = await get('/api/health');
		expect(response.status === 200, `HTTP ${response.status}`);
	});

	await check('/api/readyz is ready or degraded (not 503)', async () => {
		const response = await get('/api/readyz');
		const body = await response.json();
		expect(response.status === 200, `HTTP ${response.status}, status "${body.status}"`);
		expect(['ready', 'degraded'].includes(body.status), `status is "${body.status}"`);
		expect(response.headers.get('cache-control') === 'no-store', 'probe response may be cached');
	});

	await check('/api/version reports the build', async () => {
		const response = await get('/api/version');
		const body = await response.json();
		expect(response.status === 200, `HTTP ${response.status}`);
		expect(typeof body.version === 'string' && body.version.length > 0, 'no version');
		if (expectVersion) expect(body.version === expectVersion, `expected version "${expectVersion}", got "${body.version}"`);
	});

	await check('home page returns HTML', async () => {
		const response = await get('/');
		expect(response.status === 200, `HTTP ${response.status}`);
		expect((response.headers.get('content-type') ?? '').includes('text/html'), 'not HTML');
	});

	await check('every response carries an x-request-id header', async () => {
		const response = await get('/');
		expect(Boolean(response.headers.get('x-request-id')), 'header missing');
	});

	await check('an unknown page is a 404, not a 500', async () => {
		const response = await get('/this-page-does-not-exist');
		expect(response.status === 404, `HTTP ${response.status}`);
	});

	return results;
}

// Only run when called from the command line (not when imported by smoke.mjs).
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
	const [baseUrl, flag, value] = process.argv.slice(2);
	if (!baseUrl) {
		console.error('Usage: node scripts/smoke-http.mjs <base-url> [--expect-version <version>]');
		process.exit(2);
	}
	console.log(`Checking ${baseUrl}`);
	try {
		const results = await runHttpChecks({ baseUrl, expectVersion: flag === '--expect-version' ? value : undefined });
		const failed = results.filter((result) => !result.ok);
		console.log(failed.length ? `\n${failed.length} of ${results.length} checks FAILED` : `\nAll ${results.length} checks passed`);
		process.exit(failed.length ? 1 : 0);
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exit(1);
	}
}
