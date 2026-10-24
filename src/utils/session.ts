export interface AuthSession {
	access_token: string;
	refresh_token: string;
	expires_at: number;
	user: { id: string; email?: string };
}

export function toSession(value: Record<string, unknown>, nowSeconds = Math.floor(Date.now() / 1000)): AuthSession | null {
	if (typeof value.access_token !== 'string' || typeof value.refresh_token !== 'string' || !value.user) return null;
	const user = value.user as AuthSession['user'];
	const expiresIn = typeof value.expires_in === 'number' ? value.expires_in : 3600;
	return {
		access_token: value.access_token,
		refresh_token: value.refresh_token,
		expires_at: typeof value.expires_at === 'number' ? value.expires_at : nowSeconds + expiresIn,
		user,
	};
}

// True if the token is still valid for at least `marginSeconds` more seconds.
export function isSessionFresh(session: AuthSession, nowSeconds = Math.floor(Date.now() / 1000), marginSeconds = 60): boolean {
	return session.expires_at > nowSeconds + marginSeconds;
}
