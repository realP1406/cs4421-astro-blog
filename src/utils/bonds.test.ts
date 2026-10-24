import { describe, expect, it } from 'vitest';
import {
	formatCurrency,
	formatPaymentDate,
	getEstimatedYtm,
	getUpcomingPayments,
	getWeightedYtm,
	type Bond,
} from './bonds';

const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

// A $1,000 bond with a 5% coupon, paying on the 15th, bought at par on a payment date
// and maturing on a payment date. Override any field per test.
function makeBond(overrides: Partial<Bond> = {}): Bond {
	return {
		id: 'bond-1',
		name: 'Test bond',
		face_value: 1000,
		purchase_price: 1000,
		purchased_on: '2026-03-15',
		coupon_rate: 5,
		pay_day: 15,
		pay_months: [3, 9],
		is_cumulative: false,
		maturity_date: '2028-03-15',
		created_at: '2026-03-15T00:00:00Z',
		...overrides,
	};
}

// Interest for a number of days on $1,000 at 5%.
const coupon = (days: number) => (1000 * 0.05 * days) / 365;
const daysBetween = (from: string, to: string) =>
	(Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
const isoDate = (date: Date) => date.toISOString().slice(0, 10);

describe('getUpcomingPayments', () => {
	const from = new Date(2026, 0, 2, 12); // 2 Jan 2026, local noon
	const semiannual = makeBond({ created_at: '2026-01-01T00:00:00Z', maturity_date: '2028-01-01' });

	it('returns the right dates and amounts for a bond paying twice a year', () => {
		const payments = getUpcomingPayments([semiannual], from);
		expect(payments.map((payment) => isoDate(payment.date))).toEqual([
			'2026-03-15',
			'2026-09-15',
			'2027-03-15',
			'2027-09-15',
		]);
		// The first coupon only covers the days since the bond was added; later ones cover the gap since the last payment.
		expect(payments[0].amount).toBeCloseTo(coupon(73), 6);
		expect(payments[1].amount).toBeCloseTo(coupon(184), 6);
		expect(payments[2].amount).toBeCloseTo(coupon(181), 6);
	});

	it('copies the bond id and name onto each payment', () => {
		const [payment] = getUpcomingPayments([semiannual], from);
		expect(payment.bondId).toBe('bond-1');
		expect(payment.bondName).toBe('Test bond');
	});

	it('leaves out a payment dated exactly today', () => {
		const payments = getUpcomingPayments([semiannual], new Date(2026, 2, 15, 12));
		expect(isoDate(payments[0].date)).toBe('2026-09-15');
	});

	it('includes a payment dated tomorrow', () => {
		const payments = getUpcomingPayments([semiannual], new Date(2026, 2, 14, 12));
		expect(isoDate(payments[0].date)).toBe('2026-03-15');
	});

	it('uses the last day of the month when the pay day does not exist', () => {
		const bond = makeBond({ pay_day: 31, pay_months: [2], created_at: '2026-01-01T00:00:00Z', maturity_date: '2029-03-01' });
		const dates = getUpcomingPayments([bond], from).map((payment) => isoDate(payment.date));
		expect(dates).toEqual(['2026-02-28', '2027-02-28', '2028-02-29', '2029-02-28']);
	});

	it('gives one payment at maturity for a single-payment (cumulative) bond', () => {
		const bond = makeBond({ is_cumulative: true, pay_months: [], created_at: '2026-01-01T00:00:00Z', maturity_date: '2027-06-30' });
		const payments = getUpcomingPayments([bond], from);
		expect(payments).toHaveLength(1);
		expect(isoDate(payments[0].date)).toBe('2027-06-30');
		expect(payments[0].amount).toBeCloseTo(coupon(daysBetween('2026-01-01', '2027-06-30')), 6);
	});

	it('counts interest from today when the bond has no created_at date', () => {
		const bond = makeBond({ created_at: undefined, maturity_date: '2028-01-01' });
		const [first] = getUpcomingPayments([bond], from);
		expect(first.amount).toBeCloseTo(coupon(daysBetween('2026-01-02', '2026-03-15')), 6);
	});

	it('does not move payments that fall on a weekend', () => {
		const [first] = getUpcomingPayments([semiannual], from);
		expect(first.date.getUTCDay()).toBe(0); // 15 Mar 2026 is a Sunday
	});

	it('returns nothing for a bond that has already matured', () => {
		const matured = makeBond({ maturity_date: '2025-12-31' });
		expect(getUpcomingPayments([matured], from)).toEqual([]);
	});

	it('returns nothing for an empty list', () => {
		expect(getUpcomingPayments([], from)).toEqual([]);
	});

	it('sorts payments from several bonds by date', () => {
		const early = makeBond({ id: 'early', pay_months: [2], maturity_date: '2027-12-31', created_at: '2026-01-01T00:00:00Z' });
		const late = makeBond({ id: 'late', pay_months: [11], maturity_date: '2027-12-31', created_at: '2026-01-01T00:00:00Z' });
		const middle = makeBond({ id: 'middle', pay_months: [6], maturity_date: '2027-12-31', created_at: '2026-01-01T00:00:00Z' });
		const payments = getUpcomingPayments([late, early, middle], from);
		const times = payments.map((payment) => payment.date.getTime());
		expect(times).toEqual([...times].sort((a, b) => a - b));
		expect(payments.slice(0, 3).map((payment) => payment.bondId)).toEqual(['early', 'middle', 'late']);
	});
});

describe('getEstimatedYtm: missing or invalid data', () => {
	it.each([
		['no purchase price', { purchase_price: undefined }],
		['a null purchase price', { purchase_price: null }],
		['a zero purchase price', { purchase_price: 0 }],
		['a negative purchase price', { purchase_price: -5 }],
		['no purchase date', { purchased_on: undefined }],
		['an invalid purchase date', { purchased_on: 'not-a-date' }],
		['maturity on the purchase date', { maturity_date: '2026-03-15' }],
		['maturity before the purchase date', { maturity_date: '2025-01-01' }],
	] as [string, Partial<Bond>][])('returns null for %s', (_label, overrides) => {
		expect(getEstimatedYtm(makeBond(overrides))).toBeNull();
	});
});

describe('getEstimatedYtm: single-payment (cumulative) bonds', () => {
	it('gives the simple return for a zero-coupon bond bought at a discount', () => {
		const bond = makeBond({ is_cumulative: true, pay_months: [], coupon_rate: 0, purchase_price: 900, maturity_date: '2027-03-15' });
		expect(getEstimatedYtm(bond)).toBeCloseTo(1000 / 900 - 1, 3);
	});

	it('is about zero when the price already includes all the interest', () => {
		const bond = makeBond({ is_cumulative: true, pay_months: [], coupon_rate: 5, purchase_price: 1050, maturity_date: '2027-03-15' });
		expect(getEstimatedYtm(bond)).toBeCloseTo(0, 4);
	});
});

describe('getEstimatedYtm: payment frequency', () => {
	it.each([
		['twice a year', [3, 9]],
		['every quarter', [3, 6, 9, 12]],
		['once a year', [3]],
		['every month', ALL_MONTHS],
	] as [string, number[]][])('is close to the coupon rate for a par bond paying %s', (_label, months) => {
		expect(getEstimatedYtm(makeBond({ pay_months: months }))).toBeCloseTo(0.05, 2);
	});

	it('gives similar yields for the same coupon paid at different frequencies', () => {
		const semiannual = getEstimatedYtm(makeBond({ pay_months: [3, 9] }))!;
		const monthly = getEstimatedYtm(makeBond({ pay_months: ALL_MONTHS }))!;
		expect(Math.abs(semiannual - monthly)).toBeLessThan(0.01);
	});

	it('is close to the coupon rate when bought between two payments', () => {
		expect(getEstimatedYtm(makeBond({ purchased_on: '2026-01-01' }))).toBeCloseTo(0.05, 2);
	});
});

describe('getEstimatedYtm: price', () => {
	it('is below the coupon rate when bought above face value', () => {
		expect(getEstimatedYtm(makeBond({ purchase_price: 1050 }))!).toBeLessThan(0.05);
	});

	it('is above the coupon rate when bought below face value', () => {
		expect(getEstimatedYtm(makeBond({ purchase_price: 950 }))!).toBeGreaterThan(0.05);
	});

	it('falls as the price rises', () => {
		const cheap = getEstimatedYtm(makeBond({ purchase_price: 900 }))!;
		const par = getEstimatedYtm(makeBond({ purchase_price: 1000 }))!;
		const dear = getEstimatedYtm(makeBond({ purchase_price: 1100 }))!;
		expect(cheap).toBeGreaterThan(par);
		expect(par).toBeGreaterThan(dear);
	});
});

describe('getWeightedYtm', () => {
	it('returns null for an empty list', () => {
		expect(getWeightedYtm([])).toBeNull();
	});

	it('returns null when no bond has a purchase price', () => {
		expect(getWeightedYtm([makeBond({ purchase_price: null })])).toBeNull();
	});

	it('equals the bond yield when there is only one bond', () => {
		const bond = makeBond();
		expect(getWeightedYtm([bond])).toBeCloseTo(getEstimatedYtm(bond)!, 10);
	});

	it('ignores bonds that have no purchase price', () => {
		const priced = makeBond();
		const unpriced = makeBond({ id: 'bond-2', purchase_price: null });
		expect(getWeightedYtm([priced, unpriced])).toBeCloseTo(getEstimatedYtm(priced)!, 10);
	});

	it('weights each yield by the purchase price', () => {
		const small = makeBond({ id: 'small', purchase_price: 900 });
		const large = makeBond({ id: 'large', purchase_price: 3000, face_value: 3000 });
		const expected = (getEstimatedYtm(small)! * 900 + getEstimatedYtm(large)! * 3000) / 3900;
		expect(getWeightedYtm([small, large])).toBeCloseTo(expected, 10);
	});

	it('is the plain average when prices are equal', () => {
		const first = makeBond({ id: 'a', purchase_price: 1000 });
		const second = makeBond({ id: 'b', purchase_price: 1000, coupon_rate: 3 });
		const average = (getEstimatedYtm(first)! + getEstimatedYtm(second)!) / 2;
		expect(getWeightedYtm([first, second])).toBeCloseTo(average, 10);
	});
});

describe('formatCurrency', () => {
	it.each([
		[1234.5, '$1,234.50'],
		[0, '$0.00'],
		[-5, '-$5.00'],
		[1000000, '$1,000,000.00'],
		[0.005, '$0.01'],
	])('formats %s as %s', (amount, expected) => {
		expect(formatCurrency(amount)).toBe(expected);
	});
});

describe('formatPaymentDate', () => {
	it('uses a short numeric format by default', () => {
		expect(formatPaymentDate(new Date('2026-03-15T00:00:00Z'))).toBe('3/15/2026');
	});

	it('always uses the UTC date, even late in the day', () => {
		expect(formatPaymentDate(new Date('2026-03-15T23:30:00Z'))).toBe('3/15/2026');
	});

	it('respects formatting options', () => {
		const date = new Date('2026-03-15T00:00:00Z');
		expect(formatPaymentDate(date, { month: 'short', day: 'numeric', year: 'numeric' })).toBe('Mar 15, 2026');
		expect(formatPaymentDate(date, { month: 'long' })).toBe('March');
	});
});
