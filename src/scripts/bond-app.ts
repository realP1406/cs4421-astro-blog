import { formatCurrency, formatPaymentDate, getUpcomingPayments, type Bond } from '../utils/bonds';

interface AuthSession {
	access_token: string;
	refresh_token: string;
	expires_at: number;
	user: { id: string; email?: string };
}

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const authView = document.querySelector<HTMLElement>('#auth-view')!;
const dashboardView = document.querySelector<HTMLElement>('#dashboard-view')!;
const authForm = document.querySelector<HTMLFormElement>('#auth-form')!;
const authMessage = document.querySelector<HTMLElement>('#auth-message')!;
const authSubmit = document.querySelector<HTMLButtonElement>('#auth-submit')!;
const loginTab = document.querySelector<HTMLButtonElement>('#login-tab')!;
const signupTab = document.querySelector<HTMLButtonElement>('#signup-tab')!;
const bondDialog = document.querySelector<HTMLDialogElement>('#bond-dialog')!;
const bondForm = document.querySelector<HTMLFormElement>('#bond-form')!;
const bondMessage = document.querySelector<HTMLElement>('#bond-message')!;
const dashboardMessage = document.querySelector<HTMLElement>('#dashboard-message')!;
const signedInActions = document.querySelector<HTMLElement>('#signed-in-actions')!;
const userEmail = document.querySelector<HTMLElement>('#user-email')!;
const authTitle = document.querySelector<HTMLElement>('#auth-title')!;
const authDescription = document.querySelector<HTMLElement>('#auth-description')!;

let currentSession: AuthSession | null = null;
let bonds: Bond[] = [];
let isSignUp = false;

if (!supabaseUrl || !supabasePublishableKey) {
	authMessage.textContent = 'Add PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_PUBLISHABLE_KEY to your .env file to connect Supabase.';
	authSubmit.disabled = true;
} else {
	void initializeSession();
}

async function initializeSession(): Promise<void> {
	const storedSession = localStorage.getItem('bondwell-session');
	if (!storedSession) return;
	try {
		const session = JSON.parse(storedSession) as AuthSession;
		await setSession(session);
	} catch {
		localStorage.removeItem('bondwell-session');
	}
}

async function authRequest(path: string, body: Record<string, string>): Promise<Record<string, unknown>> {
	const response = await fetch(`${supabaseUrl}/auth/v1/${path}`, {
		method: 'POST',
		headers: { apikey: supabasePublishableKey!, 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});
	const result = await response.json().catch(() => ({})) as Record<string, unknown>;
	if (!response.ok) throw new Error(String(result.message ?? result.msg ?? result.error_description ?? response.statusText));
	return result;
}

async function getAccessToken(): Promise<string | null> {
	if (!currentSession) return null;
	if (currentSession.expires_at > Math.floor(Date.now() / 1000) + 60) return currentSession.access_token;
	try {
		const refreshed = await authRequest('token?grant_type=refresh_token', { refresh_token: currentSession.refresh_token });
		const session = toSession(refreshed);
		if (!session) throw new Error('Session refresh failed. Please sign in again.');
		currentSession = session;
		localStorage.setItem('bondwell-session', JSON.stringify(session));
		return session.access_token;
	} catch {
		localStorage.removeItem('bondwell-session');
		await setSession(null);
		return null;
	}
}

function toSession(value: Record<string, unknown>): AuthSession | null {
	if (typeof value.access_token !== 'string' || typeof value.refresh_token !== 'string' || !value.user) return null;
	const user = value.user as AuthSession['user'];
	const expiresIn = typeof value.expires_in === 'number' ? value.expires_in : 3600;
	return {
		access_token: value.access_token,
		refresh_token: value.refresh_token,
		expires_at: typeof value.expires_at === 'number' ? value.expires_at : Math.floor(Date.now() / 1000) + expiresIn,
		user,
	};
}

async function dataRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
	const token = await getAccessToken();
	if (!token) throw new Error('Your session has expired. Please sign in again.');
	const headers = new Headers(init.headers);
	headers.set('apikey', supabasePublishableKey!);
	headers.set('Authorization', `Bearer ${token}`);
	headers.set('Content-Type', 'application/json');
	const response = await fetch(`${supabaseUrl}/rest/v1/bonds${path}`, {
		...init,
		headers,
	});
	if (response.status === 204) return undefined as T;
	const result = await response.json().catch(() => ({})) as Record<string, unknown>;
	if (!response.ok) throw new Error(String(result.message ?? result.msg ?? result.hint ?? response.statusText));
	return result as T;
}

function showAuthMessage(message: string, success = false): void {
	authMessage.textContent = message;
	authMessage.style.color = success ? '#315d43' : '';
}

async function setSession(session: AuthSession | null): Promise<void> {
	currentSession = session;
	const isLoggedIn = Boolean(session);
	authView.hidden = isLoggedIn;
	dashboardView.hidden = !isLoggedIn;
	signedInActions.hidden = !isLoggedIn;
	userEmail.textContent = session?.user.email ?? '';

	if (isLoggedIn) {
		localStorage.setItem('bondwell-session', JSON.stringify(session));
		await loadBonds();
	} else {
		localStorage.removeItem('bondwell-session');
		bonds = [];
	}
}

function setAuthMode(signUp: boolean): void {
	isSignUp = signUp;
	loginTab.classList.toggle('is-active', !signUp);
	signupTab.classList.toggle('is-active', signUp);
	loginTab.setAttribute('aria-selected', String(!signUp));
	signupTab.setAttribute('aria-selected', String(signUp));
	authTitle.textContent = signUp ? 'Create your account' : 'Welcome back';
	authDescription.textContent = signUp ? 'Start keeping your bond income in view.' : 'Sign in to see your portfolio.';
	authSubmit.innerHTML = signUp ? 'Create account <span aria-hidden="true">→</span>' : 'Sign in <span aria-hidden="true">→</span>';
	authForm.querySelector<HTMLInputElement>('#password')!.autocomplete = signUp ? 'new-password' : 'current-password';
	showAuthMessage('');
}

async function loadBonds(): Promise<void> {
	if (!currentSession) return;
	dashboardMessage.textContent = '';
	try {
		const data = await dataRequest<Bond[]>(`?select=*&user_id=eq.${encodeURIComponent(currentSession.user.id)}&order=created_at.desc`);
		bonds = data;
		renderDashboard();
	} catch (error) {
		dashboardMessage.textContent = `${error instanceof Error ? error.message : 'Could not load bonds.'} Check that the Supabase bonds table and row-level security policies are set up.`;
		return;
	}
}

function renderDashboard(): void {
	const payments = getUpcomingPayments(bonds);
	const twelveMonthsFromNow = new Date();
	twelveMonthsFromNow.setDate(twelveMonthsFromNow.getDate() + 365);
	const yearPayments = payments.filter((payment) => payment.date <= twelveMonthsFromNow);
	const invested = bonds.reduce((total, bond) => total + Number(bond.face_value), 0);
	document.querySelector('#total-invested')!.textContent = formatCurrency(invested);
	document.querySelector('#bond-count')!.textContent = `${bonds.length} ${bonds.length === 1 ? 'bond' : 'bonds'}`;
	document.querySelector('#bond-count-pill')!.textContent = String(bonds.length);
	document.querySelector('#next-payment-amount')!.textContent = payments[0] ? formatCurrency(payments[0].amount) : formatCurrency(0);
	document.querySelector('#next-payment-date')!.textContent = payments[0] ? `Due ${formatPaymentDate(payments[0].date, { month: 'short', day: 'numeric', year: 'numeric' })}` : 'No payments scheduled';
	document.querySelector('#year-income')!.textContent = formatCurrency(yearPayments.reduce((total, payment) => total + payment.amount, 0));
	const greeting = document.querySelector<HTMLElement>('#greeting')!;
	greeting.textContent = `Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}.`;
	renderPayments(payments);
	renderIncomeChart(yearPayments);
	renderBonds();
}

function renderIncomeChart(payments: ReturnType<typeof getUpcomingPayments>): void {
	const now = new Date();
	const months = Array.from({ length: 12 }, (_, index) => new Date(Date.UTC(now.getFullYear(), now.getMonth() + index, 1)));
	const cutoff = new Date();
	cutoff.setDate(cutoff.getDate() + 365);
	const monthlyIncome = months.map((month) => ({
		month,
		amount: payments
			.filter((payment) => payment.date <= cutoff && payment.date.getUTCFullYear() === month.getUTCFullYear() && payment.date.getUTCMonth() === month.getUTCMonth())
			.reduce((total, payment) => total + payment.amount, 0),
	}));
	const maximumIncome = Math.max(...monthlyIncome.map(({ amount }) => amount));
	const chart = document.querySelector<HTMLElement>('#income-chart')!;
	const monthSummary = monthlyIncome.map(({ month, amount }) => `${formatPaymentDate(month, { month: 'long' })}: ${formatCurrency(amount)}`).join('; ');
	chart.setAttribute('aria-label', `Projected coupon payments by month: ${monthSummary}`);
	chart.innerHTML = monthlyIncome.map(({ month, amount }) => {
		const height = maximumIncome ? Math.round((amount / maximumIncome) * 100) : 0;
		return `<div class="income-month" title="${formatPaymentDate(month, { month: 'long', year: 'numeric' })}: ${formatCurrency(amount)}"><span class="income-bar-track" aria-hidden="true"><span class="income-bar-fill" style="height: ${height}%"></span></span><span class="income-month-label">${formatPaymentDate(month, { month: 'short' })}</span></div>`;
	}).join('');
}

function renderPayments(payments = getUpcomingPayments(bonds)): void {
	const months = Number(document.querySelector<HTMLSelectElement>('#payment-period')!.value);
	const until = new Date();
	if (months === 1) until.setDate(until.getDate() + 30);
	else until.setMonth(until.getMonth() + months);
	const visiblePayments = payments.filter((payment) => payment.date <= until);
	const list = document.querySelector<HTMLElement>('#payments-list')!;
	const bondColors = ['#91a987', '#c39a63', '#829eb0', '#b68177', '#978bad'];
	if (!visiblePayments.length) {
		list.innerHTML = '<div class="empty-state">No payments in this period.</div>';
		return;
	}
	list.innerHTML = visiblePayments.map((payment) => {
		const bondIndex = bonds.findIndex((bond) => bond.id === payment.bondId);
		const weekendNotice = [0, 6].includes(payment.date.getUTCDay())
			? '<span class="weekend-notice">Weekend date; actual payment date may vary.</span>'
			: '';
		return `<article class="payment-row" style="--payment-accent: ${bondColors[Math.max(bondIndex, 0) % bondColors.length]}"><div class="payment-date"><span>${formatPaymentDate(payment.date, { month: 'short' })}</span><span>${formatPaymentDate(payment.date, { day: 'numeric' })}</span></div><div class="payment-details"><strong>${escapeHtml(payment.bondName)}</strong><span>${formatPaymentDate(payment.date, { weekday: 'long', year: 'numeric' })}</span>${weekendNotice}</div><strong class="payment-amount">${formatCurrency(payment.amount)}</strong></article>`;
	}).join('');
}

function renderBonds(): void {
	const list = document.querySelector<HTMLElement>('#bond-list')!;
	if (!bonds.length) {
		list.innerHTML = '<div class="empty-state">Your bonds will appear here.</div>';
		return;
	}
	list.innerHTML = bonds.map((bond) => `<article class="bond-row"><div class="bond-symbol" aria-hidden="true">${escapeHtml(bond.name.slice(0, 1).toUpperCase())}</div><div class="bond-details"><strong>${escapeHtml(bond.name)}</strong><span>${Number(bond.coupon_rate).toFixed(2)}% · Matures ${formatPaymentDate(new Date(`${bond.maturity_date}T00:00:00.000Z`), { month: 'short', year: 'numeric' })}</span></div><strong class="bond-value">${formatCurrency(Number(bond.face_value))}</strong><button class="delete-bond" type="button" data-delete-bond="${escapeHtml(bond.id)}" aria-label="Delete ${escapeHtml(bond.name)}" title="Delete bond">×</button></article>`).join('');
}

function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

loginTab.addEventListener('click', () => setAuthMode(false));
signupTab.addEventListener('click', () => setAuthMode(true));

authForm.addEventListener('submit', async (event) => {
	event.preventDefault();
	if (!supabaseUrl || !supabasePublishableKey) return;
	const formData = new FormData(authForm);
	const email = String(formData.get('email'));
	const password = String(formData.get('password'));
	authSubmit.disabled = true;
	showAuthMessage('');
	try {
		const result = await authRequest(isSignUp ? 'signup' : 'token?grant_type=password', { email, password });
		const session = toSession(result);
		if (!session) {
			showAuthMessage('Check your email to confirm your account, then sign in.', true);
		} else {
			await setSession(session);
			if (isSignUp) showAuthMessage('Account created. Your portfolio is ready.', true);
		}
	} catch (error) {
		showAuthMessage(error instanceof Error ? error.message : 'Could not authenticate.');
	} finally {
		authSubmit.disabled = false;
	}
});

document.querySelector<HTMLButtonElement>('#sign-out')!.addEventListener('click', async () => {
	if (!currentSession || !supabaseUrl || !supabasePublishableKey) return;
	const token = await getAccessToken();
	if (token) {
		await fetch(`${supabaseUrl}/auth/v1/logout`, { method: 'POST', headers: { apikey: supabasePublishableKey, Authorization: `Bearer ${token}` } }).catch(() => undefined);
	}
	await setSession(null);
});

document.querySelector<HTMLButtonElement>('#open-bond-form')!.addEventListener('click', () => {
	bondMessage.textContent = '';
	bondDialog.showModal();
});
document.querySelector<HTMLButtonElement>('#close-bond-form')!.addEventListener('click', () => bondDialog.close());
bondDialog.addEventListener('click', (event) => {
	if (event.target === bondDialog) bondDialog.close();
});

bondForm.addEventListener('submit', async (event) => {
	event.preventDefault();
	if (!currentSession) return;
	const formData = new FormData(bondForm);
	const payMonths = formData.getAll('payMonths').map(Number).sort((first, second) => first - second);
	const isCumulative = formData.has('isCumulative');
	if (!isCumulative && !payMonths.length) {
		bondMessage.textContent = 'Choose at least one payment month, or select single payment at maturity.';
		return;
	}
	const submitButton = bondForm.querySelector<HTMLButtonElement>('button[type="submit"]')!;
	submitButton.disabled = true;
	bondMessage.textContent = '';
	try {
		await dataRequest('', {
			method: 'POST',
			headers: { Prefer: 'return=minimal' },
			body: JSON.stringify({
				user_id: currentSession.user.id,
				name: String(formData.get('name')).trim(),
				face_value: Number(formData.get('faceValue')),
				coupon_rate: Number(formData.get('couponRate')),
				pay_day: Number(formData.get('payDay')),
				pay_months: isCumulative ? [] : payMonths,
				is_cumulative: isCumulative,
				maturity_date: String(formData.get('maturityDate')),
			}),
		});
	} catch (error) {
		bondMessage.textContent = error instanceof Error ? error.message : 'Could not save this bond.';
		submitButton.disabled = false;
		return;
	}
	submitButton.disabled = false;
	bondForm.reset();
	document.querySelector<HTMLInputElement>('#pay-day')!.value = '15';
	document.querySelectorAll<HTMLInputElement>('input[name="payMonths"]').forEach((input) => { input.checked = input.value === '3' || input.value === '9'; });
	bondDialog.close();
	await loadBonds();
});

document.querySelector<HTMLSelectElement>('#payment-period')!.addEventListener('change', () => renderPayments());
document.querySelector<HTMLElement>('#bond-list')!.addEventListener('click', async (event) => {
	const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-delete-bond]');
	if (!button || !currentSession) return;
	try {
		await dataRequest(`?id=eq.${encodeURIComponent(button.dataset.deleteBond ?? '')}&user_id=eq.${encodeURIComponent(currentSession.user.id)}`, { method: 'DELETE' });
	} catch (error) {
		dashboardMessage.textContent = error instanceof Error ? error.message : 'Could not delete this bond.';
		return;
	}
	await loadBonds();
});