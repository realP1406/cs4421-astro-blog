import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node',
		globalSetup: ['./vitest.global-setup.ts'],
		coverage: {
			provider: 'v8',
			include: ['src/utils/**/*.ts'],
			exclude: ['src/**/*.test.ts'],
			reporter: ['text', 'lcov'],
			thresholds: { lines: 80, statements: 80, functions: 80, branches: 70 },
		},
	},
});
