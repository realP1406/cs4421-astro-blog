export interface BondInput {
	name: string;
	faceValue: number;
	couponRate: number;
	payDay: number;
	payMonths: number[];
	isCumulative: boolean;
}

// Mirrors the checks in supabase/schema.sql. Returns an error message, or null if the input is valid.
export function validateBondInput(input: BondInput): string | null {
	const name = input.name.trim();
	if (name.length < 1 || name.length > 100) return 'Enter a name up to 100 characters.';
	if (!Number.isFinite(input.faceValue) || input.faceValue <= 0) return 'Face value must be more than 0.';
	if (!Number.isFinite(input.couponRate) || input.couponRate < 0 || input.couponRate > 100) return 'Coupon rate must be between 0 and 100.';
	if (!Number.isInteger(input.payDay) || input.payDay < 1 || input.payDay > 31) return 'Payment day must be between 1 and 31.';
	if (input.payMonths.length > 12 || input.payMonths.some((month) => !Number.isInteger(month) || month < 1 || month > 12)) return 'Payment months must be between 1 and 12.';
	if (!input.isCumulative && !input.payMonths.length) return 'Choose at least one payment month, or select single payment at maturity.';
	return null;
}
