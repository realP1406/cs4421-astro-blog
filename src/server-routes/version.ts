import type { APIRoute } from 'astro';
import { json } from '../server/http';
import { getVersionInfo } from '../server/version';

// Which build is running? Used after a deploy to confirm the new version is live.
export const GET: APIRoute = () => json({ ...getVersionInfo(), node: process.version });
