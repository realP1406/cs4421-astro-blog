import { describe, expect, it } from 'vitest';
import type { Logger } from './logger';
import { createRequestLogger, pickRequestId, pickTraceId } from './request-logger';

interface Entry {
	level: string;
	message: string;
	fields: Record<string, unknown>;
}

function fakeLogger() {
	const entries: Entry[] = [];
	const record = (level: string) => (message: string, fields: Record<string, unknown> = {}) => {
		entries.push({ level, message, fields });
	};
	const logger: Logger = { debug: record('DEBUG'), info: record('INFO'), warn: record('WARN'), error: record('ERROR') };
	return { logger, entries };
}

// Each call to now() moves the clock forward 10ms, so latency is always 10.
function makeHandler() {
	const { logger, entries } = fakeLogger();
	let clock = 0;
	const handler = createRequestLogger({ logger, now: () => (clock += 10), newId: () => 'generated-id' });
	return { handler, entries };
}

function makeContext(path: string, init: RequestInit = {}) {
	const locals: Record<string, unknown> = {};
	return { context: { request: new Request(`http://localhost:4321${path}`, init), locals } as never, locals };
}

const respond = (status: number) => async () => new Response('body', { status });

type Handler = ReturnType<typeof createRequestLogger>;

// The middleware type allows returning nothing; ours always returns the response, so insist on it.
async function run(handler: Handler, context: never, next: () => Promise<Response>): Promise<Response> {
	const response = await handler(context, next);
	if (!response) throw new Error('middleware returned no response');
	return response;
}

describe('createRequestLogger', () => {
	it('logs one INFO line with request ID, route, method, status and latency', async () => {
		const { handler, entries } = makeHandler();
		const { context } = makeContext('/about');
		await handler(context, respond(200));
		expect(entries).toEqual([
			{
				level: 'INFO',
				message: 'request',
				fields: { requestId: 'generated-id', route: '/about', method: 'GET', statusCode: 200, latencyMs: 10 },
			},
		]);
	});

	it('logs the path without the query string', async () => {
		const { handler, entries } = makeHandler();
		await handler(makeContext('/blog?secret=1').context, respond(200));
		expect(entries[0].fields.route).toBe('/blog');
	});

	it('records the HTTP method', async () => {
		const { handler, entries } = makeHandler();
		await handler(makeContext('/api/x', { method: 'POST' }).context, respond(201));
		expect(entries[0].fields.method).toBe('POST');
	});

	it('returns the response it was given, untouched apart from the request ID header', async () => {
		const { handler } = makeHandler();
		const response = await run(handler, makeContext('/').context, respond(200));
		expect(response.status).toBe(200);
		expect(await response.text()).toBe('body');
	});

	it.each([
		[404, 'WARN', 'request rejected'],
		[400, 'WARN', 'request rejected'],
		[500, 'ERROR', 'request failed'],
		[503, 'ERROR', 'request failed'],
	])('logs a %s response as %s', async (status, level, message) => {
		const { handler, entries } = makeHandler();
		await handler(makeContext('/thing').context, respond(status));
		expect(entries[0]).toMatchObject({ level, message });
		expect(entries[0].fields.statusCode).toBe(status);
	});
});

describe('request IDs', () => {
	it('generates an ID, puts it in the response header and in locals', async () => {
		const { handler } = makeHandler();
		const { context, locals } = makeContext('/');
		const response = await run(handler, context, respond(200));
		expect(response.headers.get('x-request-id')).toBe('generated-id');
		expect(locals.requestId).toBe('generated-id');
	});

	it('reuses a safe ID sent by the caller (for example the load balancer)', async () => {
		const { handler, entries } = makeHandler();
		const { context, locals } = makeContext('/', { headers: { 'x-request-id': 'client-req-42' } });
		const response = await run(handler, context, respond(200));
		expect(response.headers.get('x-request-id')).toBe('client-req-42');
		expect(entries[0].fields.requestId).toBe('client-req-42');
		expect(locals.requestId).toBe('client-req-42');
	});

	it('accepts typical ID formats', () => {
		expect(pickRequestId('3f2a9c1e-7b44-4d0a-9c1e-aa55bb66cc77', () => 'new')).toBe('3f2a9c1e-7b44-4d0a-9c1e-aa55bb66cc77');
		expect(pickRequestId('abc_123.DEF:456', () => 'new')).toBe('abc_123.DEF:456');
	});

	it.each([
		['an ID with spaces', 'has space'],
		['an ID with a newline (log injection)', 'abc\n{"level":"ERROR"}'],
		['a JSON payload', '{"a":1}'],
		['an ID that is too long', 'a'.repeat(129)],
		['an empty ID', ''],
	])('replaces %s with a generated ID', (_label, value) => {
		expect(pickRequestId(value, () => 'generated-id')).toBe('generated-id');
	});

	it('generates an ID when none is sent', () => {
		expect(pickRequestId(null, () => 'generated-id')).toBe('generated-id');
	});

	it('uses a real random UUID by default', async () => {
		const { logger } = fakeLogger();
		const handler = createRequestLogger({ logger });
		const response = await run(handler, makeContext('/').context, respond(200));
		expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
	});
});

describe('load balancer trace ID', () => {
	const albTrace = 'Root=1-67891233-abcdef012345678912345678';

	it('is logged when the load balancer sends it', async () => {
		const { handler, entries } = makeHandler();
		await handler(makeContext('/', { headers: { 'x-amzn-trace-id': albTrace } }).context, respond(200));
		expect(entries[0].fields.traceId).toBe(albTrace);
	});

	it('is left out when there is none', async () => {
		const { handler, entries } = makeHandler();
		await handler(makeContext('/').context, respond(200));
		expect(entries[0].fields).not.toHaveProperty('traceId');
	});

	it('is also logged when the page code throws', async () => {
		const { handler, entries } = makeHandler();
		const failing = async () => {
			throw new Error('x');
		};
		await expect(handler(makeContext('/', { headers: { 'x-amzn-trace-id': albTrace } }).context, failing)).rejects.toThrow();
		expect(entries[0].fields.traceId).toBe(albTrace);
	});

	it('is dropped if it contains unsafe characters', () => {
		expect(pickTraceId(albTrace)).toBe(albTrace);
		expect(pickTraceId('Root=1-abc\n{"level":"ERROR"}')).toBeUndefined();
		expect(pickTraceId('a'.repeat(257))).toBeUndefined();
		expect(pickTraceId(null)).toBeUndefined();
	});
});

describe('probe requests', () => {
	it.each(['/api/health', '/api/livez', '/api/readyz'])('logs a successful %s at DEBUG only', async (path) => {
		const { handler, entries } = makeHandler();
		await handler(makeContext(path).context, respond(200));
		expect(entries).toHaveLength(1);
		expect(entries[0]).toMatchObject({ level: 'DEBUG', message: 'probe' });
	});

	it('logs a failing probe as a WARN, not an ERROR', async () => {
		const { handler, entries } = makeHandler();
		await handler(makeContext('/api/readyz').context, respond(503));
		expect(entries[0]).toMatchObject({ level: 'WARN', message: 'probe failed' });
		expect(entries[0].fields.statusCode).toBe(503);
	});

	it('logs other API routes as normal requests', async () => {
		const { handler, entries } = makeHandler();
		await handler(makeContext('/api/version').context, respond(200));
		expect(entries[0]).toMatchObject({ level: 'INFO', message: 'request' });
	});
});

describe('when the page code throws', () => {
	it('logs an ERROR with the error details, then rethrows', async () => {
		const { handler, entries } = makeHandler();
		const failing = async () => {
			throw new RangeError('something broke');
		};
		await expect(handler(makeContext('/crash').context, failing)).rejects.toThrow('something broke');
		expect(entries).toHaveLength(1);
		expect(entries[0]).toMatchObject({ level: 'ERROR', message: 'request crashed' });
		expect(entries[0].fields).toMatchObject({
			requestId: 'generated-id',
			route: '/crash',
			statusCode: 500,
			errorName: 'RangeError',
			error: 'something broke',
		});
		expect(String(entries[0].fields.stack)).toContain('RangeError');
	});
});
