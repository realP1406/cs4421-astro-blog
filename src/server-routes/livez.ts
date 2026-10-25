import type { APIRoute } from 'astro';
import { buildLivenessReport } from '../server/health';
import { json } from '../server/http';
import { getStartedAt } from '../server/state';
import { getVersionInfo } from '../server/version';

// Liveness probe: is the process up? Checks no dependencies. Always 200 while the server can answer.
export const GET: APIRoute = () => json(buildLivenessReport({ startedAt: getStartedAt(), info: getVersionInfo() }));
