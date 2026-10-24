import type { BondPayment } from './bonds';

export interface MonthlyIncome {
	month: Date;
	amount: number;
}

// Sums payments into the next 12 calendar months, ignoring anything more than 365 days away.
export function getMonthlyIncome(payments: BondPayment[], now = new Date()): MonthlyIncome[] {
	const months = Array.from({ length: 12 }, (_, index) => new Date(Date.UTC(now.getFullYear(), now.getMonth() + index, 1)));
	const cutoff = new Date(now.getTime());
	cutoff.setDate(cutoff.getDate() + 365);
	return months.map((month) => ({
		month,
		amount: payments
			.filter((payment) => payment.date <= cutoff && payment.date.getUTCFullYear() === month.getUTCFullYear() && payment.date.getUTCMonth() === month.getUTCMonth())
			.reduce((total, payment) => total + payment.amount, 0),
	}));
}

export function getBarHeightPercent(amount: number, maximum: number): number {
	return maximum ? Math.round((amount / maximum) * 100) : 0;
}
