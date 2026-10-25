import type { VersionInfo } from './version';

// ---------------------------------------------------------------------------
// Liveness: "is the process running and able to answer?"
// It checks NO dependencies on purpose. If it failed whenever Supabase was down,
// the orchestrator would restart healthy servers over and over.
// ---------------------------------------------------------------------------

export interface LivenessReport extends VersionInfo {
	status: 'ok';
	uptimeSeconds: number;
	timestamp: string;
	memoryMb: number;
}

export interface LivenessInput {
	startedAt: number;
	info: VersionInfo;
	now?: number;
	rssBytes?: number;
}

export function buildLivenessReport(input: LivenessInput): LivenessReport {
	const now = input.now ?? Date.now();
	const rssBytes = input.rssBytes ?? process.memoryUsage().rss;
	return {
		status: 'ok',
		...input.info,
		uptimeSeconds: Math.round(((now - input.startedAt) / 1000) * 10) / 10,
		timestamp: new Date(now).toISOString(),
		memoryMb: Math.round(rssBytes / 1_048_576),
	};
}

// ---------------------------------------------------------------------------
// Readiness: "should the load balancer send traffic to this instance right now?"
//
//   not_ready (503) - a CRITICAL check failed: missing config, shutting down, or Supabase
//                     rejected our key (a bad deploy). The instance is taken out of rotation.
//   degraded  (200) - only a NON-critical check failed: Supabase is slow or unreachable. The
//                     pages are still served (sign-in happens in the browser), so we stay in
//                     rotation, but the problem is visible in the body and in the logs.
//   ready     (200) - everything is fine.
//
// Set requireSupabase to make "Supabase unreachable" critical too.
// ---------------------------------------------------------------------------

export interface CheckResult {
	status: 'ok' | 'fail';
	critical: boolean;
	latencyMs?: number;
	message?: string;
}

export interface ReadinessReport extends VersionInfo {
	status: 'ready' | 'degraded' | 'not_ready';
	uptimeSeconds: number;
	timestamp: string;
	checks: Record<string, CheckResult>;
}

export interface ReadinessResult {
	httpStatus: 200 | 503;
	body: ReadinessReport;
}

export interface ReadinessOptions {
	startedAt: number;
	info: VersionInfo;
	supabaseUrl?: string;
	apiKey?: string;
	requireSupabase?: boolean;
	timeoutMs?: number;
	cacheTtlMs?: number;
	fetchImpl?: typeof fetch;
	now?: () => number;
	isShuttingDown?: () => boolean;
}

interface SupabaseProbe {
	outcome: 'ok' | 'unreachable' | 'rejected';
	latencyMs: number;
	message?: string;
}

export function createReadinessChecker(options: ReadinessOptions): () => Promise<ReadinessResult> {
	const timeoutMs = options.timeoutMs ?? 2000;
	const cacheTtlMs = options.cacheTtlMs ?? 5000;
	const fetchImpl = options.fetchImpl ?? fetch;
	const now = options.now ?? Date.now;
	const isShuttingDown = options.isShuttingDown ?? (() => false);

	let cached: { at: number; probe: SupabaseProbe } | undefined;
	let inFlight: Promise<SupabaseProbe> | undefined;

	async function probeSupabase(): Promise<SupabaseProbe> {
		const started = now();
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);
		try {
			const response = await fetchImpl(`${options.supabaseUrl!.replace(/\/+$/, '')}/auth/v1/health`, {
				headers: { apikey: options.apiKey! },
				signal: controller.signal,
			});
			const latencyMs = now() - started;
			if (response.ok) return { outcome: 'ok', latencyMs };
			if (response.status === 401 || response.status === 403) {
				return { outcome: 'rejected', latencyMs, message: `credentials rejected (HTTP ${response.status})` };
			}
			return { outcome: 'unreachable', latencyMs, message: `HTTP ${response.status}` };
		} catch (error) {
			const timedOut = controller.signal.aborted || (error instanceof Error && error.name === 'AbortError');
			// Generic messages only: never echo the URL, key or raw error text in a public response.
			return { outcome: 'unreachable', latencyMs: now() - started, message: timedOut ? `timeout after ${timeoutMs}ms` : 'unreachable' };
		} finally {
			clearTimeout(timer);
		}
	}

	// Probes are cached briefly and shared, so many load balancer nodes polling at once
	// cause one Supabase call, not dozens.
	function getSupabaseProbe(): Promise<SupabaseProbe> {
		if (cached && now() - cached.at < cacheTtlMs) return Promise.resolve(cached.probe);
		if (inFlight) return inFlight;
		inFlight = probeSupabase()
			.then((probe) => {
				cached = { at: now(), probe };
				return probe;
			})
			.finally(() => {
				inFlight = undefined;
			});
		return inFlight;
	}

	return async function checkReadiness(): Promise<ReadinessResult> {
		const checks: Record<string, CheckResult> = {};

		const configured = Boolean(options.supabaseUrl && options.apiKey);
		checks.config = configured
			? { status: 'ok', critical: true }
			: { status: 'fail', critical: true, message: 'Supabase URL or key is not configured' };

		const draining = isShuttingDown();
		checks.lifecycle = draining
			? { status: 'fail', critical: true, message: 'shutting down' }
			: { status: 'ok', critical: true };

		// Skip the outbound call when the answer is already "not ready".
		if (configured && !draining) {
			const probe = await getSupabaseProbe();
			const critical = probe.outcome === 'rejected' || Boolean(options.requireSupabase);
			checks.supabase = probe.outcome === 'ok'
				? { status: 'ok', critical, latencyMs: probe.latencyMs }
				: { status: 'fail', critical, latencyMs: probe.latencyMs, message: probe.message };
		}

		const failed = Object.values(checks).filter((check) => check.status === 'fail');
		const status = failed.some((check) => check.critical) ? 'not_ready' : failed.length ? 'degraded' : 'ready';

		const current = now();
		return {
			httpStatus: status === 'not_ready' ? 503 : 200,
			body: {
				status,
				...options.info,
				uptimeSeconds: Math.round(((current - options.startedAt) / 1000) * 10) / 10,
				timestamp: new Date(current).toISOString(),
				checks,
			},
		};
	};
}
