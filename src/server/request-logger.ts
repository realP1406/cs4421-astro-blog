import type { MiddlewareHandler } from 'astro';
import { serializeError, type Logger } from './logger';

// Probes hit these every few seconds, so successful ones are logged at DEBUG only.
const PROBE_PATHS = new Set(['/api/health', '/api/livez', '/api/readyz']);

// An incoming request ID is only trusted if it looks like an ID (not a log-injection payload).
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

// The AWS load balancer adds its own trace header, e.g. "Root=1-67891233-abcdef012345678912345678".
// Logging it lets an app log line be matched to the load balancer's access log entry.
const SAFE_TRACE_ID = /^[A-Za-z0-9=;._:-]{1,256}$/;

export function pickTraceId(incoming: string | null): string | undefined {
	return incoming && SAFE_TRACE_ID.test(incoming) ? incoming : undefined;
}

export interface RequestLoggerOptions {
	logger: Logger;
	now?: () => number;
	newId?: () => string;
}

export function pickRequestId(incoming: string | null, newId: () => string): string {
	return incoming && SAFE_REQUEST_ID.test(incoming) ? incoming : newId();
}

// One structured log line per request: request ID, route, method, status and how long it took.
// The same ID is sent back in the x-request-id response header, so a user's error report
// can be matched to the exact log lines.
export function createRequestLogger({
	logger,
	now = () => performance.now(),
	newId = () => crypto.randomUUID(),
}: RequestLoggerOptions): MiddlewareHandler {
	return async (context, next) => {
		const started = now();
		const route = new URL(context.request.url).pathname;
		const method = context.request.method;
		const requestId = pickRequestId(context.request.headers.get('x-request-id'), newId);
		const traceId = pickTraceId(context.request.headers.get('x-amzn-trace-id'));
		(context.locals as Record<string, unknown>).requestId = requestId;

		try {
			const response = await next();
			response.headers.set('x-request-id', requestId);
			const fields = { requestId, ...(traceId && { traceId }), route, method, statusCode: response.status, latencyMs: Math.round(now() - started) };

			if (PROBE_PATHS.has(route)) {
				if (response.status < 300) logger.debug('probe', fields);
				else logger.warn('probe failed', fields);
			} else if (response.status >= 500) {
				logger.error('request failed', fields);
			} else if (response.status >= 400) {
				logger.warn('request rejected', fields);
			} else {
				logger.info('request', fields);
			}
			return response;
		} catch (error) {
			logger.error('request crashed', {
				requestId,
				...(traceId && { traceId }),
				route,
				method,
				statusCode: 500,
				latencyMs: Math.round(now() - started),
				...serializeError(error),
			});
			throw error;
		}
	};
}
