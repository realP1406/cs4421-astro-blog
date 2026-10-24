import type { Page } from '@playwright/test';
import type { Bond } from '../../src/utils/bonds';

export const SUPABASE_ORIGIN = 'https://e2e-test.supabase.co';

export const TEST_USER = { id: 'user-1', email: 'tester@example.com' };

// Far-future maturity dates so these bonds keep paying coupons no matter when the tests run.
export const TREASURY_NOTE: Bond = {
	id: 'bond-1',
	user_id: TEST_USER.id,
	name: 'Treasury Note',
	face_value: 1000,
	coupon_rate: 5,
	pay_day: 15,
	pay_months: [3, 9],
	is_cumulative: false,
	maturity_date: '2099-03-15',
	created_at: '2026-01-01T00:00:00Z',
};

export const CORPORATE_BOND: Bond = {
	id: 'bond-2',
	user_id: TEST_USER.id,
	name: 'Corporate Bond',
	face_value: 2500,
	coupon_rate: 4,
	pay_day: 1,
	pay_months: [6, 12],
	is_cumulative: false,
	maturity_date: '2099-12-01',
	created_at: '2026-01-01T00:00:00Z',
};

export interface MockOptions {
	bonds?: Bond[];
	// Set to e.g. 400 to make sign-in fail.
	signInStatus?: number;
}

export interface MockState {
	bonds: Bond[];
	requests: string[];
	savedBonds: Record<string, unknown>[];
}

const CORS_HEADERS = {
	'access-control-allow-origin': '*',
	'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
	'access-control-allow-headers': 'authorization, apikey, content-type, prefer, x-client-info',
};

// Answers every request the app sends to Supabase, so the tests need no real project or secrets.
export async function mockSupabase(page: Page, options: MockOptions = {}): Promise<MockState> {
	const state: MockState = { bonds: [...(options.bonds ?? [])], requests: [], savedBonds: [] };

	await page.route(`${SUPABASE_ORIGIN}/**`, async (route) => {
		const request = route.request();
		const url = new URL(request.url());
		const method = request.method();

		if (method === 'OPTIONS') {
			await route.fulfill({ status: 204, headers: CORS_HEADERS });
			return;
		}

		state.requests.push(`${method} ${url.pathname}`);
		const json = (status: number, body: unknown) =>
			route.fulfill({ status, headers: { ...CORS_HEADERS, 'content-type': 'application/json' }, body: JSON.stringify(body) });
		const empty = (status: number) => route.fulfill({ status, headers: CORS_HEADERS, body: '' });

		if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
			if (options.signInStatus && options.signInStatus !== 200) {
				await json(options.signInStatus, { error_description: 'Invalid login credentials' });
				return;
			}
			await json(200, { access_token: 'test-access-token', refresh_token: 'test-refresh-token', expires_in: 3600, user: TEST_USER });
			return;
		}

		if (url.pathname === '/auth/v1/logout') {
			await empty(204);
			return;
		}

		if (url.pathname === '/rest/v1/bonds') {
			if (method === 'GET') {
				await json(200, state.bonds);
				return;
			}
			if (method === 'POST') {
				const body = request.postDataJSON() as Record<string, unknown>;
				state.savedBonds.push(body);
				state.bonds.unshift({ id: `bond-${state.bonds.length + 10}`, created_at: new Date().toISOString(), ...body } as Bond);
				await empty(201);
				return;
			}
			if (method === 'DELETE') {
				const id = url.searchParams.get('id')?.replace('eq.', '');
				state.bonds = state.bonds.filter((bond) => bond.id !== id);
				await empty(204);
				return;
			}
		}

		// Anything unexpected fails loudly instead of silently passing.
		await json(500, { message: `Unmocked request: ${method} ${url.pathname}` });
	});

	return state;
}
