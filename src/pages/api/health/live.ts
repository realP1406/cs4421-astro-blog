import type { APIRoute } from 'astro';

export const GET: APIRoute = () => {
  const uptime = process.uptime();
  console.info('liveness', 'ok', uptime);

  return Response.json({
    status: 'ok',
    uptime,
    timestamp: new Date(),
  });
};