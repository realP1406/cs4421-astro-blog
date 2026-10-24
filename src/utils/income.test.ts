import { describe, expect, it } from 'vitest';
import type { BondPayment } from './bonds';
import { getBarHeightPercent, getMonthlyIncome } from './income';

const now = new Date(2026, 5, 10, 12); // 10 June 2026, local noon

function payment(date: string, amount: number): BondPayment {
	return { bondId: 'bond-1', bondName: 'Test bond', date: new Date(`${date}T00:00:00Z`), amount };
}

const monthKey = (month: Date) => month.toISOString().slice(0, 7);

describe('getMonthlyIncome', () => {
	it('returns twelve months starting with the current month', () => {
		const months = getMonthlyIncome([], now).map(({ month }) => monthKey(month));
		expect(months).toHaveLength(12);
		expect(months[0]).toBe('2026-06');
		expect(months[11]).toBe('2027-05');
	});

	it('gives every month an amount of zero when there are no payments', () => {
		expect(getMonthlyIncome([], now).every(({ amount }) => amount === 0)).toBe(true);
	});

	it('puts each payment in the right month', () => {
		const result = getMonthlyIncome([payment('2026-09-15', 25), payment('2027-03-15', 30)], now);
		const byMonth = Object.fromEntries(result.map(({ month, amount }) => [monthKey(month), amount]));
		expect(byMonth['2026-09']).toBe(25);
		expect(byMonth['2027-03']).toBe(30);
		expect(byMonth['2026-10']).toBe(0);
	});

	it('adds up several payments in the same month', () => {
		const result = getMonthlyIncome([payment('2026-09-01', 10), payment('2026-09-20', 15.5)], now);
		expect(result.find(({ month }) => monthKey(month) === '2026-09')!.amount).toBeCloseTo(25.5, 10);
	});

	it('ignores payments after the 365 day cut-off', () => {
		const result = getMonthlyIncome([payment('2027-08-15', 99)], now);
		expect(result.reduce((total, { amount }) => total + amount, 0)).toBe(0);
	});

	it('ignores payments from before the current month', () => {
		const result = getMonthlyIncome([payment('2026-05-15', 99)], now);
		expect(result.reduce((total, { amount }) => total + amount, 0)).toBe(0);
	});
});

describe('getBarHeightPercent', () => {
	it.each([
		[25, 100, 25],
		[100, 100, 100],
		[1, 3, 33],
		[2, 3, 67],
		[0, 100, 0],
	])('gives %s out of %s a height of %s%%', (amount, maximum, expected) => {
		expect(getBarHeightPercent(amount, maximum)).toBe(expected);
	});

	it('gives 0 when every month is zero (no divide by zero)', () => {
		expect(getBarHeightPercent(0, 0)).toBe(0);
	});
});
