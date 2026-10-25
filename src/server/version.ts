import pkg from '../../package.json';

export interface VersionInfo {
	version: string;
	commit: string;
}

// APP_VERSION and GIT_SHA are set when the container is built (T3/T5). Locally they fall back
// to the package.json version and "unknown".
export function getVersionInfo(env: Record<string, string | undefined> = process.env): VersionInfo {
	return {
		version: env.APP_VERSION || pkg.version,
		commit: env.GIT_SHA || 'unknown',
	};
}
