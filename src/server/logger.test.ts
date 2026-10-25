import { describe, expect, it } from 'vitest';
import { createLogger, parseLogLevel, redact, serializeError } from './logger';

const fixedNow = () => new Date('2026-10-25T12:00:00.000Z');

function capture(options: Parameters<typeof createLogger>[0] = {}) {
	const lines: string[] = [];
	const logger = createLogger({ write: (line) => lines.push(line), now: fixedNow, ...options });
	return { logger, lines, parsed: () => lines.map((line) => JSON.parse(line) as Record<string, unknown>) };
}

describe('createLogger', () => {
	it('writes one valid JSON object per call', () => {
		const { logger, lines, parsed } = capture();
		logger.info('hello', { route: '/x' });
		expect(lines).toHaveLength(1);
		expect(lines[0]).not.toContain('\n');
		expect(parsed()[0]).toEqual({ timestamp: '2026-10-25T12:00:00.000Z', level: 'INFO', message: 'hello', route: '/x' });
	});

	it('uses upper-case levels', () => {
		const { logger, parsed } = capture({ minLevel: 'DEBUG' });
		logger.debug('a');
		logger.info('b');
		logger.warn('c');
		logger.error('d');
		expect(parsed().map((entry) => entry.level)).toEqual(['DEBUG', 'INFO', 'WARN', 'ERROR']);
	});

	it('hides lines below the minimum level', () => {
		const { logger, parsed } = capture({ minLevel: 'WARN' });
		logger.debug('a');
		logger.info('b');
		logger.warn('c');
		logger.error('d');
		expect(parsed().map((entry) => entry.message)).toEqual(['c', 'd']);
	});

	it('defaults to INFO, so DEBUG is hidden', () => {
		const { logger, lines } = capture();
		logger.debug('quiet');
		expect(lines).toHaveLength(0);
	});

	it('adds base fields to every line, and per-call fields win', () => {
		const { logger, parsed } = capture({ base: { version: '1.0.0', commit: 'abc' } });
		logger.info('one');
		logger.info('two', { commit: 'override' });
		expect(parsed()[0]).toMatchObject({ version: '1.0.0', commit: 'abc' });
		expect(parsed()[1]).toMatchObject({ version: '1.0.0', commit: 'override' });
	});

	it('writes to stdout by default', () => {
		const original = process.stdout.write.bind(process.stdout);
		const chunks: string[] = [];
		process.stdout.write = ((chunk: string) => (chunks.push(String(chunk)), true)) as typeof process.stdout.write;
		try {
			createLogger().info('to stdout');
		} finally {
			process.stdout.write = original;
		}
		expect(chunks.join('')).toMatch(/"message":"to stdout"/);
		expect(chunks.join('').endsWith('\n')).toBe(true);
	});
});

describe('redaction', () => {
	it.each(['authorization', 'Authorization', 'apikey', 'api_key', 'password', 'refresh_token', 'access_token', 'client_secret', 'cookie'])(
		'hides the value of "%s"',
		(key) => {
			const { logger, parsed } = capture();
			logger.info('x', { [key]: 'super-secret-value' });
			expect(parsed()[0][key]).toBe('[REDACTED]');
			expect(JSON.stringify(parsed()[0])).not.toContain('super-secret-value');
		},
	);

	it('hides secrets inside nested objects and arrays', () => {
		const { logger, lines } = capture();
		logger.info('x', { headers: { Authorization: 'Bearer abc', accept: 'json' }, list: [{ password: 'p4ss' }] });
		expect(lines[0]).not.toContain('Bearer abc');
		expect(lines[0]).not.toContain('p4ss');
		expect(lines[0]).toContain('json');
	});

	it('keeps harmless fields', () => {
		expect(redact({ route: '/api/readyz', statusCode: 200 })).toEqual({ route: '/api/readyz', statusCode: 200 });
	});

	it('does not change the object it was given', () => {
		const input = { password: 'keep-me', nested: { token: 't' } };
		redact(input);
		expect(input).toEqual({ password: 'keep-me', nested: { token: 't' } });
	});

	it('stops at a maximum depth instead of looping forever', () => {
		const circularLike: Record<string, unknown> = {};
		let node = circularLike;
		for (let i = 0; i < 10; i += 1) {
			node.next = {};
			node = node.next as Record<string, unknown>;
		}
		expect(JSON.stringify(redact(circularLike))).toContain('[TRUNCATED]');
	});
});

describe('serializeError', () => {
	it('captures name, message and stack of an Error', () => {
		const result = serializeError(new TypeError('boom'));
		expect(result.errorName).toBe('TypeError');
		expect(result.error).toBe('boom');
		expect(result.stack).toContain('TypeError: boom');
	});

	it('limits the stack length', () => {
		const error = new Error('long');
		error.stack = 'x'.repeat(5000);
		expect(serializeError(error).stack).toHaveLength(2000);
	});

	it('handles things that are not Errors', () => {
		expect(serializeError('just a string')).toEqual({ errorName: 'NonError', error: 'just a string' });
		expect(serializeError(42)).toEqual({ errorName: 'NonError', error: '42' });
	});
});

describe('parseLogLevel', () => {
	it.each([
		['debug', 'DEBUG'],
		['WARN', 'WARN'],
		['Error', 'ERROR'],
		['info', 'INFO'],
	])('reads %s as %s', (input, expected) => {
		expect(parseLogLevel(input)).toBe(expected);
	});

	it.each([undefined, '', 'verbose', 'trace'])('falls back to INFO for %j', (input) => {
		expect(parseLogLevel(input)).toBe('INFO');
	});
});
