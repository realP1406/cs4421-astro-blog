import { describe, expect, it } from 'vitest';
import { json } from './http';

describe('json', () => {
	it('returns 200 with a JSON body by default', async () => {
		const response = json({ status: 'ok' });
		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toBe('application/json');
		expect(await response.json()).toEqual({ status: 'ok' });
	});

	it('uses the status code it is given', () => {
		expect(json({ status: 'not_ready' }, 503).status).toBe(503);
	});

	it('is never cached, so probes always get a fresh answer', () => {
		expect(json({}).headers.get('Cache-Control')).toBe('no-store');
	});
});
