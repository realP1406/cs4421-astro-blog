import { describe, expect, it } from 'vitest';
import pkg from '../../package.json';
import { getVersionInfo } from './version';

describe('getVersionInfo', () => {
	it('uses APP_VERSION and GIT_SHA when they are set', () => {
		expect(getVersionInfo({ APP_VERSION: '2.0.1', GIT_SHA: 'abc1234' })).toEqual({ version: '2.0.1', commit: 'abc1234' });
	});

	it('falls back to the package.json version and "unknown"', () => {
		expect(getVersionInfo({})).toEqual({ version: pkg.version, commit: 'unknown' });
	});

	it('treats empty values as not set', () => {
		expect(getVersionInfo({ APP_VERSION: '', GIT_SHA: '' })).toEqual({ version: pkg.version, commit: 'unknown' });
	});
});
