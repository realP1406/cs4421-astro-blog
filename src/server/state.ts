import { logger as defaultLogger } from './default-logger';
import type { Logger } from './logger';

const startedAtMs = Date.now();
let shuttingDown = false;

export function getStartedAt(): number {
	return startedAtMs;
}

export function isShuttingDown(): boolean {
	return shuttingDown;
}

export function beginShutdown(): void {
	shuttingDown = true;
}

export interface ShutdownOptions {
	// How long to keep serving (while reporting "not ready") before exiting. Lets the load balancer notice.
	graceMs?: number;
	exit?: (code: number) => void;
	onSignal?: (signal: 'SIGTERM' | 'SIGINT', handler: () => void) => void;
	logger?: Logger;
}

// On SIGTERM (what ECS and Docker send on stop) the server first reports "not ready" so the load
// balancer stops sending traffic, keeps serving for a short grace period, then exits cleanly.
// Ctrl+C (SIGINT) exits straight away so local development stays quick.
// Without a handler, Node running as PID 1 in a container ignores SIGTERM and gets force-killed.
export function installShutdownHandlers(options: ShutdownOptions = {}): void {
	const graceMs = options.graceMs ?? Number(process.env.SHUTDOWN_GRACE_MS ?? 5000);
	const exit = options.exit ?? ((code: number) => process.exit(code));
	const onSignal = options.onSignal ?? ((signal, handler) => { process.once(signal, handler); });
	const logger = options.logger ?? defaultLogger;

	onSignal('SIGTERM', () => {
		beginShutdown();
		logger.info('Shutdown requested: draining', { signal: 'SIGTERM', graceMs });
		setTimeout(() => {
			logger.info('Shutdown complete');
			exit(0);
		}, graceMs);
	});

	onSignal('SIGINT', () => {
		logger.info('Interrupted: exiting', { signal: 'SIGINT' });
		exit(0);
	});
}
