import { describe, expect, it } from 'vitest';
import { escapeHtml } from './html';

describe('escapeHtml', () => {
	it.each([
		['&', '&amp;'],
		['<', '&lt;'],
		['>', '&gt;'],
		['"', '&quot;'],
		["'", '&#39;'],
	])('escapes %s', (character, expected) => {
		expect(escapeHtml(character)).toBe(expected);
	});

	it('leaves normal text alone', () => {
		expect(escapeHtml('Treasury note 2030')).toBe('Treasury note 2030');
	});

	it('returns an empty string unchanged', () => {
		expect(escapeHtml('')).toBe('');
	});

	it('escapes every occurrence, not just the first', () => {
		expect(escapeHtml('a < b < c')).toBe('a &lt; b &lt; c');
	});

	it('does not escape twice', () => {
		expect(escapeHtml('&lt;')).toBe('&amp;lt;');
	});

	it('neutralises script injection in a bond name', () => {
		const result = escapeHtml('<img src=x onerror="alert(1)">');
		expect(result).not.toContain('<');
		expect(result).not.toContain('>');
		expect(result).not.toContain('"');
	});
});
