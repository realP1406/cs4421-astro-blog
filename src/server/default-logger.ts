import { createLogger, parseLogLevel } from './logger';
import { getVersionInfo } from './version';

// The one logger the running server shares. Every line carries the version and commit,
// so a log line always says which build wrote it. LOG_LEVEL=DEBUG shows probe successes too.
export const logger = createLogger({ minLevel: parseLogLevel(process.env.LOG_LEVEL), base: { ...getVersionInfo() } });
