export interface Bond {
	id: string;
	user_id?: string;
	name: string;
	face_value: number;
	purchase_price?: number | null;
	purchased_on?: string;
	coupon_rate: number;
	pay_day: number;
	pay_months: number[];
	is_cumulative: boolean;
	maturity_date: string;
	created_at?: string;
}

export interface BondPayment {
	bondId: string;
	bondName: string;
	date: Date;
	amount: number;
}

export function getEstimatedYtm(bond: Bond): number | null {
	const purchasePrice = Number(bond.purchase_price);
	if (!Number.isFinite(purchasePrice) || purchasePrice <= 0 || !bond.purchased_on) return null;

	const purchaseDate = new Date(`${bond.purchased_on.slice(0, 10)}T00:00:00.000Z`);
	const maturity = new Date(`${bond.maturity_date}T00:00:00.000Z`);
	if (!Number.isFinite(purchaseDate.getTime()) || maturity <= purchaseDate) return null;

	const cashFlows = new Map<number, number>();
	if (bond.is_cumulative) {
		cashFlows.set(maturity.getTime(), bond.face_value * (bond.coupon_rate / 100) * ((maturity.getTime() - purchaseDate.getTime()) / 86_400_000 / 365) + bond.face_value);
	} else {
		// Build the full payment schedule (starting one year early so the first payment has a previous date).
		const scheduledDates = new Map<number, Date>();
		for (let year = purchaseDate.getUTCFullYear() - 1; year <= maturity.getUTCFullYear(); year += 1) {
			for (const month of bond.pay_months) {
				const date = paymentDate(year, month, bond.pay_day);
				scheduledDates.set(date.getTime(), date);
			}
		}
		const schedule = [...scheduledDates.values()].sort((first, second) => first.getTime() - second.getTime());

		// Each coupon covers the days since the previous payment (or since purchase, for the first one).
		schedule.forEach((date, index) => {
			if (date <= purchaseDate || date > maturity) return;
			const previousDate = schedule[index - 1];
			const accrualStart = previousDate && previousDate > purchaseDate ? previousDate : purchaseDate;
			const days = (date.getTime() - accrualStart.getTime()) / 86_400_000;
			cashFlows.set(date.getTime(), bond.face_value * (bond.coupon_rate / 100) * days / 365);
		});
		cashFlows.set(maturity.getTime(), (cashFlows.get(maturity.getTime()) ?? 0) + bond.face_value);
	}

	const flows = [...cashFlows].map(([time, amount]) => ({ years: (time - purchaseDate.getTime()) / (365 * 86_400_000), amount }));
	const presentValueDifference = (rate: number) => flows.reduce((total, flow) => total + flow.amount / (1 + rate) ** flow.years, -purchasePrice);
	let low = -0.9999;
	let high = 1;
	while (high < 1_000_000 && presentValueDifference(high) > 0) high *= 2;
	if (presentValueDifference(low) < 0 || presentValueDifference(high) > 0) return null;

	for (let iteration = 0; iteration < 100; iteration += 1) {
		const middle = (low + high) / 2;
		if (presentValueDifference(middle) > 0) low = middle;
		else high = middle;
	}
	return (low + high) / 2;
}

export function getWeightedYtm(bonds: Bond[]): number | null {
	const pricedBonds = bonds.flatMap((bond) => {
		const yieldToMaturity = getEstimatedYtm(bond);
		const price = Number(bond.purchase_price);
		return yieldToMaturity !== null && Number.isFinite(price) && price > 0 ? [{ yieldToMaturity, price }] : [];
	});
	const totalPrice = pricedBonds.reduce((total, bond) => total + bond.price, 0);
	if (!totalPrice) return null;
	return pricedBonds.reduce((total, bond) => total + bond.yieldToMaturity * bond.price, 0) / totalPrice;
}

function paymentDate(year: number, month: number, day: number): Date {
	const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
	return new Date(Date.UTC(year, month - 1, Math.min(day, lastDay)));
}

function dateOnly(date: Date): Date {
	return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

export function getUpcomingPayments(bonds: Bond[], from = new Date()): BondPayment[] {
	const today = dateOnly(from);
	const payments: BondPayment[] = [];

	for (const bond of bonds) {
		const maturity = new Date(`${bond.maturity_date}T00:00:00.000Z`);
		const dates: Date[] = [];

		if (bond.is_cumulative) {
			dates.push(maturity);
		} else {
			for (let year = today.getUTCFullYear() - 1; year <= maturity.getUTCFullYear(); year += 1) {
				for (const month of bond.pay_months) {
					dates.push(paymentDate(year, month, bond.pay_day));
				}
			}
		}

		const upcomingDates = dates
			.filter((date) => date > today && date <= maturity)
			.sort((first, second) => first.getTime() - second.getTime());
		const createdAt = new Date(`${bond.created_at?.slice(0, 10) ?? today.toISOString().slice(0, 10)}T00:00:00.000Z`);

		for (const date of upcomingDates) {
			const previousDate = dates
				.filter((previous) => previous < date && previous <= maturity)
				.sort((first, second) => second.getTime() - first.getTime())[0];
			const accrualStart = previousDate && previousDate > createdAt ? previousDate : createdAt;
			const dayCount = Math.max(0, Math.round((date.getTime() - accrualStart.getTime()) / 86_400_000));
			const amount = (bond.face_value * (bond.coupon_rate / 100) * dayCount) / 365;
			payments.push({ bondId: bond.id, bondName: bond.name, date, amount });
		}
	}

	return payments.sort((first, second) => first.date.getTime() - second.date.getTime());
}

export function formatCurrency(amount: number): string {
	return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

export function formatPaymentDate(date: Date, options: Intl.DateTimeFormatOptions = {}): string {
	return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...options }).format(date);
}