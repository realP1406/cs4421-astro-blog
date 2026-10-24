import { describe, expect, it } from 'vitest';
import { isSessionFresh, toSession, type AuthSession } from './session';

const user = { id: 'user-1', email: 'tester@example.com' };
const NOW = 1_000_000;

describe('toSession', () => {
	it('builds a session from a valid response', () => {
		const session = toSession({ access_token: 'a', refresh_token: 'r', expires_at: 5000, user }, NOW);
		expect(session).toEqual({ access_token: 'a', refresh_token: 'r', expires_at: 5000, user });
	});

	it.each([
		['no access token', { refresh_token: 'r', user }],
		['no refresh token', { access_token: 'a', user }],
		['no user', { access_token: 'a', refresh_token: 'r' }],
		['a non-string access token', { access_token: 123, refresh_token: 'r', user }],
		['an empty object', {}],
	])('returns null for %s', (_label, value) => {
		expect(toSession(value as Record<string, unknown>, NOW)).toBeNull();
	});

	it('defaults to a one-hour expiry when the response has no expiry', () => {
		expect(toSession({ access_token: 'a', refresh_token: 'r', user }, NOW)!.expires_at).toBe(NOW + 3600);
	});

	it('uses expires_in when it is given', () => {
		expect(toSession({ access_token: 'a', refresh_token: 'r', expires_in: 600, user }, NOW)!.expires_at).toBe(NOW + 600);
	});

	it('prefers expires_at over expires_in', () => {
		const session = toSession({ access_token: 'a', refresh_token: 'r', expires_in: 600, expires_at: 42, user }, NOW);
		expect(session!.expires_at).toBe(42);
	});

	it('ignores an expires_in that is not a number', () => {
		expect(toSession({ access_token: 'a', refresh_token: 'r', expires_in: '600', user }, NOW)!.expires_at).toBe(NOW + 3600);
	});
});

describe('isSessionFresh', () => {
	const session = (expires_at: number): AuthSession => ({ access_token: 'a', refresh_token: 'r', expires_at, user });

	it('is true when the token has plenty of time left', () => {
		expect(isSessionFresh(session(NOW + 3600), NOW)).toBe(true);
	});

	it('is false when the token has already expired', () => {
		expect(isSessionFresh(session(NOW - 1), NOW)).toBe(false);
	});

	it('is false when less than the 60 second margin remains', () => {
		expect(isSessionFresh(session(NOW + 60), NOW)).toBe(false);
		expect(isSessionFresh(session(NOW + 30), NOW)).toBe(false);
	});

	it('is true just past the margin', () => {
		expect(isSessionFresh(session(NOW + 61), NOW)).toBe(true);
	});

	it('accepts a custom margin', () => {
		expect(isSessionFresh(session(NOW + 100), NOW, 300)).toBe(false);
		expect(isSessionFresh(session(NOW + 400), NOW, 300)).toBe(true);
	});
});
