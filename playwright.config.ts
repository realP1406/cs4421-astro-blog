import { defineConfig, devices } from '@playwright/test';

// A port that the normal dev server (4321) does not use, so tests never hit a stale server.
const PORT = 4322;

export default defineConfig({
	testDir: './e2e',
	timeout: 30_000,
	expect: { timeout: 7_000 },
	fullyParallel: true,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
	use: {
		baseURL: `http://localhost:${PORT}`,
		trace: 'on-first-retry',
	},
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
	webServer: {
		// Astro bakes PUBLIC_* values in at build time, so they are set for the build step too.
		// The URL is fake: every request to it is answered by e2e/support/supabase.ts.
		command: `npm run build && npm run preview -- --port ${PORT}`,
		url: `http://localhost:${PORT}`,
		reuseExistingServer: !process.env.CI,
		timeout: 180_000,
		env: {
			PUBLIC_SUPABASE_URL: 'https://e2e-test.supabase.co',
			PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_e2e_test_key',
		},
	},
});
