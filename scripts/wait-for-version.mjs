// Waits until a deployed site reports the version you just released. Run it after a deploy:
//
//   node scripts/wait-for-version.mjs http://<load-balancer-address> 1.2.0
//   node scripts/wait-for-version.mjs https://your-site.example 1.2.0 --timeout 600
//
// With blue/green the old version keeps serving until the new one is healthy, then traffic switches.
// "Live" means /api/version has said the new version several times in a row (not just once).
// Exit code 0 = the new version is live. 1 = it never showed up in time (the release probably rolled back).
import { pathToFileURL } from 'node:url';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function waitForVersion({ baseUrl, expectedVersion, timeoutSeconds = 600, intervalSeconds = 5, stableCount = 3, log = console.log }) {
	const url = `${baseUrl.replace(/\/+$/, '')}/api/version`;
	const deadline = Date.now() + timeoutSeconds * 1000;
	let matches = 0;
	let last = '';

	while (Date.now() < deadline) {
		let seen;
		try {
			const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
			seen = response.ok ? (await response.json()).version : `HTTP ${response.status}`;
		} catch {
			seen = 'no answer';
		}

		matches = seen === expectedVersion ? matches + 1 : 0;
		if (seen !== last) {
			log(`  ${new Date().toISOString().slice(11, 19)}  serving: ${seen}`);
			last = seen;
		}
		if (matches >= stableCount) return { ok: true, version: seen };
		await sleep(intervalSeconds * 1000);
	}
	return { ok: false, version: last };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
	const args = process.argv.slice(2);
	const [baseUrl, expectedVersion] = args;
	const option = (name, fallback) => {
		const index = args.indexOf(name);
		return index >= 0 ? Number(args[index + 1]) : fallback;
	};
	if (!baseUrl || !expectedVersion) {
		console.error('Usage: node scripts/wait-for-version.mjs <base-url> <expected-version> [--timeout 600] [--interval 5] [--stable 3]');
		process.exit(2);
	}
	console.log(`Waiting for ${baseUrl} to report version ${expectedVersion}`);
	const result = await waitForVersion({
		baseUrl,
		expectedVersion,
		timeoutSeconds: option('--timeout', 600),
		intervalSeconds: option('--interval', 5),
		stableCount: option('--stable', 3),
	});
	if (result.ok) {
		console.log(`\nVersion ${expectedVersion} is live.`);
		process.exit(0);
	}
	console.error(`\nTimed out. The site is still serving: ${result.version}. The release probably did not go live (check for a rollback).`);
	process.exit(1);
}
