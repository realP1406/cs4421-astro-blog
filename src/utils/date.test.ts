import { describe, expect, it } from 'vitest';
import { formatDate } from './date';

describe('formatDate', () => {
	it('formats a date as "Mon D, YYYY"', () => {
		expect(formatDate(new Date('2026-03-15T00:00:00Z'))).toBe('Mar 15, 2026');
	});

	it('uses the UTC date, so the result does not depend on the machine time zone', () => {
		expect(formatDate(new Date('2026-01-01T00:00:00Z'))).toBe('Jan 1, 2026');
		expect(formatDate(new Date('2025-12-31T23:59:59Z'))).toBe('Dec 31, 2025');
	});

	it('does not pad single-digit days', () => {
		expect(formatDate(new Date('2026-07-04T12:00:00Z'))).toBe('Jul 4, 2026');
	});
});
