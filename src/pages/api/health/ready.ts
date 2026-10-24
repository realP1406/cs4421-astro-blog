
import type { APIRoute } from 'astro';

export const GET: APIRoute = () => {
  const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
  const supabaseKey = import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  const checks = {
    supabaseUrlConfigured: Boolean(supabaseUrl),
    supabaseKeyConfigured: Boolean(supabaseKey),
  };

  let validSupabaseUrl = false;

  if (supabaseUrl) {
    try {
      const url = new URL(supabaseUrl);
      validSupabaseUrl =
        url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
      validSupabaseUrl = false;
    }
  }

  const ready =
    checks.supabaseUrlConfigured &&
    checks.supabaseKeyConfigured &&
    validSupabaseUrl;

  const status = ready ? 'ready' : 'not_ready';

  console.info(
    JSON.stringify({
      event: 'health_check',
      probe: 'readiness',
      status,
      checks: {
        ...checks,
        supabaseUrlValid: validSupabaseUrl,
      },
      timestamp: new Date().toISOString(),
    }),
  );

  return Response.json(
    {
      status,
      checks: {
        ...checks,
        supabaseUrlValid: validSupabaseUrl,
      },
      timestamp: new Date().toISOString(),
    },
    {
      status: ready ? 200 : 503,
    },
  );
};
