import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node',
		globalSetup: ['./vitest.global-setup.ts'],
		coverage: {
			provider: 'v8',
			include: ['src/utils/**/*.ts', 'src/server/**/*.ts'],
			// Thin wiring files that only connect the tested pieces together at server start.
			exclude: ['src/**/*.test.ts', 'src/server/startup.ts', 'src/server/middleware-entry.ts', 'src/server/default-logger.ts'],
			reporter: ['text', 'lcov'],
			thresholds: { lines: 80, statements: 80, functions: 80, branches: 70 },
		},
	},
});
