
import type { APIRoute } from 'astro';

export const GET: APIRoute = () => {
  const uptime = process.uptime();

  console.info(
    JSON.stringify({
      event: 'health_check',
      probe: 'liveness',
      status: 'ok',
      uptime,
      timestamp: new Date().toISOString(),
    }),
  );

  return Response.json({
    status: 'ok',
    uptime,
    timestamp: new Date().toISOString(),
  });
};
