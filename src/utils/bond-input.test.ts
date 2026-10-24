import { describe, expect, it } from 'vitest';
import { validateBondInput, type BondInput } from './bond-input';

function makeInput(overrides: Partial<BondInput> = {}): BondInput {
	return {
		name: 'Treasury note',
		faceValue: 1000,
		couponRate: 4.25,
		payDay: 15,
		payMonths: [3, 9],
		isCumulative: false,
		...overrides,
	};
}

describe('validateBondInput', () => {
	it('accepts a valid bond', () => {
		expect(validateBondInput(makeInput())).toBeNull();
	});

	describe('name', () => {
		it('rejects an empty name', () => {
			expect(validateBondInput(makeInput({ name: '' }))).toMatch(/name/i);
		});

		it('rejects a name that is only spaces', () => {
			expect(validateBondInput(makeInput({ name: '   ' }))).toMatch(/name/i);
		});

		it('accepts a name of exactly 100 characters', () => {
			expect(validateBondInput(makeInput({ name: 'a'.repeat(100) }))).toBeNull();
		});

		it('rejects a name of 101 characters', () => {
			expect(validateBondInput(makeInput({ name: 'a'.repeat(101) }))).toMatch(/name/i);
		});
	});

	describe('face value', () => {
		it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('rejects %s', (faceValue) => {
			expect(validateBondInput(makeInput({ faceValue }))).toMatch(/face value/i);
		});

		it('accepts a small positive value', () => {
			expect(validateBondInput(makeInput({ faceValue: 0.01 }))).toBeNull();
		});
	});

	describe('coupon rate', () => {
		it.each([-0.01, 100.01, Number.NaN])('rejects %s', (couponRate) => {
			expect(validateBondInput(makeInput({ couponRate }))).toMatch(/coupon/i);
		});

		it.each([0, 100])('accepts %s', (couponRate) => {
			expect(validateBondInput(makeInput({ couponRate }))).toBeNull();
		});
	});

	describe('payment day', () => {
		it.each([0, 32, 15.5, Number.NaN])('rejects %s', (payDay) => {
			expect(validateBondInput(makeInput({ payDay }))).toMatch(/day/i);
		});

		it.each([1, 31])('accepts %s', (payDay) => {
			expect(validateBondInput(makeInput({ payDay }))).toBeNull();
		});
	});

	describe('payment months', () => {
		it.each([[[0]], [[13]], [[1.5]], [[-3]]])('rejects the month list %j', (payMonths) => {
			expect(validateBondInput(makeInput({ payMonths }))).toMatch(/months/i);
		});

		it('rejects more than twelve months', () => {
			expect(validateBondInput(makeInput({ payMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 12] }))).toMatch(/months/i);
		});

		it('accepts all twelve months', () => {
			expect(validateBondInput(makeInput({ payMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }))).toBeNull();
		});

		it('asks for at least one month when the bond is not a single-payment bond', () => {
			expect(validateBondInput(makeInput({ payMonths: [] }))).toBe(
				'Choose at least one payment month, or select single payment at maturity.',
			);
		});

		it('does not need any months for a single-payment (cumulative) bond', () => {
			expect(validateBondInput(makeInput({ payMonths: [], isCumulative: true }))).toBeNull();
		});
	});
});
