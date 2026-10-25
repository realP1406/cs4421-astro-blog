import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Logger } from './logger';

const quietLogger = (messages: string[] = []): Logger => ({
	debug: () => {},
	info: (message) => void messages.push(message),
	warn: () => {},
	error: () => {},
});

// The module keeps its state in variables, so each test loads a fresh copy.
async function freshState() {
	vi.resetModules();
	return import('./state');
}

function installWith(state: Awaited<ReturnType<typeof freshState>>, graceMs = 1000, messages: string[] = []) {
	const handlers = new Map<string, () => void>();
	const exit = vi.fn();
	state.installShutdownHandlers({
		graceMs,
		exit,
		onSignal: (signal, handler) => void handlers.set(signal, handler),
		logger: quietLogger(messages),
	});
	return { handlers, exit };
}

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('shutdown state', () => {
	it('starts as not shutting down', async () => {
		const state = await freshState();
		expect(state.isShuttingDown()).toBe(false);
	});

	it('beginShutdown flips the flag', async () => {
		const state = await freshState();
		state.beginShutdown();
		expect(state.isShuttingDown()).toBe(true);
	});

	it('records when the server started', async () => {
		vi.setSystemTime(new Date('2026-10-25T10:00:00Z'));
		const state = await freshState();
		expect(state.getStartedAt()).toBe(Date.parse('2026-10-25T10:00:00Z'));
	});
});

describe('installShutdownHandlers', () => {
	it('listens for both SIGTERM and SIGINT', async () => {
		const { handlers } = installWith(await freshState());
		expect([...handlers.keys()].sort()).toEqual(['SIGINT', 'SIGTERM']);
	});

	it('SIGTERM marks the server as shutting down straight away but waits before exiting', async () => {
		const state = await freshState();
		const { handlers, exit } = installWith(state, 3000);
		handlers.get('SIGTERM')!();
		expect(state.isShuttingDown()).toBe(true);
		vi.advanceTimersByTime(2999);
		expect(exit).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(exit).toHaveBeenCalledOnce();
		expect(exit).toHaveBeenCalledWith(0);
	});

	it('logs the start and end of the drain', async () => {
		const messages: string[] = [];
		const { handlers } = installWith(await freshState(), 500, messages);
		handlers.get('SIGTERM')!();
		vi.advanceTimersByTime(500);
		expect(messages).toEqual(['Shutdown requested: draining', 'Shutdown complete']);
	});

	it('SIGINT (Ctrl+C) exits immediately without draining', async () => {
		const state = await freshState();
		const { handlers, exit } = installWith(state);
		handlers.get('SIGINT')!();
		expect(exit).toHaveBeenCalledWith(0);
		expect(state.isShuttingDown()).toBe(false);
	});

	it('reads the grace period from SHUTDOWN_GRACE_MS when none is given', async () => {
		vi.stubEnv('SHUTDOWN_GRACE_MS', '1500');
		const state = await freshState();
		const handlers = new Map<string, () => void>();
		const exit = vi.fn();
		state.installShutdownHandlers({ exit, onSignal: (signal, handler) => void handlers.set(signal, handler), logger: quietLogger() });
		handlers.get('SIGTERM')!();
		vi.advanceTimersByTime(1499);
		expect(exit).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(exit).toHaveBeenCalledOnce();
		vi.unstubAllEnvs();
	});
});
