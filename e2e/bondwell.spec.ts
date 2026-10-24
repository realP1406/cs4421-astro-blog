import { expect, test, type Page } from '@playwright/test';
import { CORPORATE_BOND, TREASURY_NOTE, mockSupabase } from './support/supabase';

async function signIn(page: Page): Promise<void> {
	await page.goto('/');
	await page.locator('#email').fill('tester@example.com');
	await page.locator('#password').fill('password123');
	await page.locator('#auth-submit').click();
	await expect(page.locator('#dashboard-view')).toBeVisible();
}

test('shows the sign-in form and switches to create account', async ({ page }) => {
	await mockSupabase(page);
	await page.goto('/');

	await expect(page.locator('#auth-title')).toHaveText('Welcome back');
	await expect(page.locator('#auth-submit')).toContainText('Sign in');
	await expect(page.locator('#dashboard-view')).toBeHidden();

	await page.locator('#signup-tab').click();
	await expect(page.locator('#auth-title')).toHaveText('Create your account');
	await expect(page.locator('#auth-submit')).toContainText('Create account');

	await page.locator('#login-tab').click();
	await expect(page.locator('#auth-title')).toHaveText('Welcome back');
});

test('signs in and shows the portfolio dashboard', async ({ page }) => {
	await mockSupabase(page, { bonds: [TREASURY_NOTE, CORPORATE_BOND] });
	await signIn(page);

	await expect(page.locator('#auth-view')).toBeHidden();
	await expect(page.locator('#user-email')).toHaveText('tester@example.com');
	await expect(page.locator('#total-invested')).toHaveText('$3,500.00');
	await expect(page.locator('#bond-count')).toHaveText('2 bonds');
	await expect(page.locator('#bond-list .bond-row')).toHaveCount(2);
	await expect(page.locator('#bond-list')).toContainText('Treasury Note');
	await expect(page.locator('#bond-list')).toContainText('Corporate Bond');
	await expect(page.locator('#next-payment-amount')).not.toHaveText('$0.00');
	await expect(page.locator('#payments-list .payment-row').first()).toBeVisible();
});

test('shows an error and stays signed out when the credentials are wrong', async ({ page }) => {
	await mockSupabase(page, { signInStatus: 400 });
	await page.goto('/');
	await page.locator('#email').fill('tester@example.com');
	await page.locator('#password').fill('wrong-password');
	await page.locator('#auth-submit').click();

	await expect(page.locator('#auth-message')).toContainText('Invalid login credentials');
	await expect(page.locator('#dashboard-view')).toBeHidden();
	await expect(page.locator('#auth-view')).toBeVisible();
});

test('refuses to save a bond with no payment months', async ({ page }) => {
	const supabase = await mockSupabase(page, { bonds: [TREASURY_NOTE] });
	await signIn(page);

	await page.locator('#open-bond-form').click();
	await page.locator('#bond-name').fill('No months bond');
	await page.locator('#face-value').fill('1000');
	await page.locator('#coupon-rate').fill('4');
	await page.locator('#maturity-date').fill('2035-01-15');
	// March and September are ticked by default; untick both.
	await page.locator('.month-option', { hasText: 'Mar' }).click();
	await page.locator('.month-option', { hasText: 'Sep' }).click();
	await page.locator('#bond-form button[type="submit"]').click();

	await expect(page.locator('#bond-message')).toContainText('Choose at least one payment month');
	expect(supabase.savedBonds).toHaveLength(0);
});

test('saves a new bond and adds it to the list', async ({ page }) => {
	const supabase = await mockSupabase(page, { bonds: [TREASURY_NOTE] });
	await signIn(page);
	await expect(page.locator('#bond-list .bond-row')).toHaveCount(1);

	await page.locator('#open-bond-form').click();
	await page.locator('#bond-name').fill('Municipal Bond');
	await page.locator('#face-value').fill('500');
	await page.locator('#coupon-rate').fill('4.5');
	await page.locator('#maturity-date').fill('2035-01-15');
	await page.locator('#bond-form button[type="submit"]').click();

	await expect(page.locator('#bond-dialog')).toBeHidden();
	await expect(page.locator('#bond-list .bond-row')).toHaveCount(2);
	await expect(page.locator('#bond-list')).toContainText('Municipal Bond');
	await expect(page.locator('#total-invested')).toHaveText('$1,500.00');

	expect(supabase.savedBonds).toHaveLength(1);
	expect(supabase.savedBonds[0]).toMatchObject({
		name: 'Municipal Bond',
		face_value: 500,
		coupon_rate: 4.5,
		pay_day: 15,
		pay_months: [3, 9],
		is_cumulative: false,
		maturity_date: '2035-01-15',
	});
});

test('deletes a bond from the list', async ({ page }) => {
	await mockSupabase(page, { bonds: [TREASURY_NOTE, CORPORATE_BOND] });
	await signIn(page);
	await expect(page.locator('#bond-list .bond-row')).toHaveCount(2);

	await page.locator(`[data-delete-bond="${TREASURY_NOTE.id}"]`).click();

	await expect(page.locator('#bond-list .bond-row')).toHaveCount(1);
	await expect(page.locator('#bond-list')).not.toContainText('Treasury Note');
	await expect(page.locator('#total-invested')).toHaveText('$2,500.00');
});
