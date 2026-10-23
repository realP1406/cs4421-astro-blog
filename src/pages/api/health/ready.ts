import type { APIRoute } from 'astro';

export const GET: APIRoute = () => {
  console.info('readiness', 'ready');

  return Response.json({
    status: 'ready',
    timestamp: new Date(),
  });
};