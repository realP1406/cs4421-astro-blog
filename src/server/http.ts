// JSON response that must never be cached: probes need a fresh answer every time.
export function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
	});
}
