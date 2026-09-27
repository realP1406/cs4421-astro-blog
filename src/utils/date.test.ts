import { describe, expect, it } from 'vitest';
import { formatDate } from './date';

describe('formatDate', () => {
	it('formats a date as a readable calendar date', () => {
		expect(formatDate(new Date('2024-01-15T00:00:00.000Z'))).toBe('Jan 15, 2024');
	});

	it('formats single-digit days without a leading zero', () => {
		expect(formatDate(new Date('2024-06-05T00:00:00.000Z'))).toBe('Jun 5, 2024');
	});
});
