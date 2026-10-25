export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
export type LogFields = Record<string, unknown>;

const LEVEL_ORDER: Record<LogLevel, number> = { DEBUG: 10, INFO: 20, WARN: 30, ERROR: 40 };

// Any field whose name contains one of these is replaced before it is written.
const SENSITIVE_KEY = /authorization|apikey|api_key|password|passwd|secret|token|cookie|credential/i;
const REDACTED = '[REDACTED]';
const MAX_DEPTH = 4;

export interface LoggerOptions {
	minLevel?: LogLevel;
	base?: LogFields;
	write?: (line: string) => void;
	now?: () => Date;
}

export interface Logger {
	debug(message: string, fields?: LogFields): void;
	info(message: string, fields?: LogFields): void;
	warn(message: string, fields?: LogFields): void;
	error(message: string, fields?: LogFields): void;
}

export function redact(value: unknown, depth = 0): unknown {
	if (Array.isArray(value)) return depth >= MAX_DEPTH ? '[TRUNCATED]' : value.map((item) => redact(item, depth + 1));
	if (value && typeof value === 'object' && !(value instanceof Date)) {
		if (depth >= MAX_DEPTH) return '[TRUNCATED]';
		return Object.fromEntries(
			Object.entries(value).map(([key, item]) => [key, SENSITIVE_KEY.test(key) ? REDACTED : redact(item, depth + 1)]),
		);
	}
	return value;
}

// Turns an Error into plain fields. The stack goes to the logs only, never into an HTTP response.
export function serializeError(error: unknown): { errorName: string; error: string; stack?: string } {
	if (error instanceof Error) {
		return { errorName: error.name, error: error.message, stack: error.stack?.slice(0, 2000) };
	}
	return { errorName: 'NonError', error: String(error) };
}

// Writes one JSON object per line to stdout, which is what CloudWatch Logs expects.
export function createLogger(options: LoggerOptions = {}): Logger {
	const minLevel = options.minLevel ?? 'INFO';
	const write = options.write ?? ((line: string) => process.stdout.write(`${line}\n`));
	const now = options.now ?? (() => new Date());
	const base = options.base ?? {};

	const log = (level: LogLevel, message: string, fields: LogFields = {}): void => {
		if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;
		write(JSON.stringify(redact({ timestamp: now().toISOString(), level, message, ...base, ...fields })));
	};

	return {
		debug: (message, fields) => log('DEBUG', message, fields),
		info: (message, fields) => log('INFO', message, fields),
		warn: (message, fields) => log('WARN', message, fields),
		error: (message, fields) => log('ERROR', message, fields),
	};
}

export function parseLogLevel(value: string | undefined): LogLevel {
	const upper = value?.toUpperCase();
	return upper === 'DEBUG' || upper === 'INFO' || upper === 'WARN' || upper === 'ERROR' ? upper : 'INFO';
}
