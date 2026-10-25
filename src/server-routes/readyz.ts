import type { APIRoute } from 'astro';
import { logger } from '../server/default-logger';
import { createReadinessChecker } from '../server/health';
import { json } from '../server/http';
import { getStartedAt, isShuttingDown } from '../server/state';
import { getVersionInfo } from '../server/version';

// Created once, so the short-lived cache inside it is shared by every request.
const checkReadiness = createReadinessChecker({
	startedAt: getStartedAt(),
	info: getVersionInfo(),
	supabaseUrl: import.meta.env.PUBLIC_SUPABASE_URL,
	apiKey: import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
	requireSupabase: process.env.READINESS_REQUIRE_SUPABASE === 'true',
	isShuttingDown,
});

// Readiness probe: 200 when this instance should receive traffic, 503 when it should not.
export const GET: APIRoute = async ({ locals }) => {
	const { httpStatus, body } = await checkReadiness();

	// Healthy checks stay quiet. A degraded or failing one is logged, so CloudWatch can alarm on it.
	if (body.status !== 'ready') {
		const failing = Object.fromEntries(
			Object.entries(body.checks).filter(([, check]) => check.status === 'fail').map(([name, check]) => [name, check.message ?? 'failed']),
		);
		logger.warn(`readiness ${body.status}`, { requestId: (locals as Record<string, unknown>).requestId, readiness: body.status, failing });
	}

	return json(body, httpStatus);
};
