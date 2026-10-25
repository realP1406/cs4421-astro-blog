// Builds the Docker image, runs it, and checks it behaves like a production container.
//
//   npm run docker:smoke
//
// Needs Docker running. Works on Windows, macOS and Linux (plain Node, no bash).
import { execFileSync } from 'node:child_process';
import net from 'node:net';
import { runHttpChecks } from './smoke-http.mjs';

const IMAGE = process.env.SMOKE_IMAGE ?? 'astro-blog:smoke';
const NAME = `astro-blog-smoke-${process.pid}`;
const VERSION = `smoke-${Date.now()}`;
const MAX_IMAGE_MB = Number(process.env.MAX_IMAGE_MB ?? 600);

// Returns the command's output as text. When output is streamed to the terminal (stdio: 'inherit') there is none, so ''.
const docker = (args, options = {}) => String(execFileSync('docker', args, { encoding: 'utf8', ...options }) ?? '').trim();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function freePort() {
	return new Promise((resolve, reject) => {
		const server = net.createServer();
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			const { port } = server.address();
			server.close(() => resolve(port));
		});
	});
}

const results = [];
let containerStarted = false;
const record = (name, ok, message = '') => {
	results.push({ name, ok });
	console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${message ? `: ${message}` : ''}`);
};

function checkDocker() {
	try {
		docker(['--version']);
	} catch (error) {
		if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
			throw new Error('Docker CLI was not found. Install Docker Desktop, reopen PowerShell, and verify `docker --version` works.');
		}
		throw error;
	}

	try {
		docker(['info']);
	} catch {
		throw new Error('Docker CLI is installed, but Docker Engine is not reachable. Start Docker Desktop, wait for it to finish starting, then verify `docker info` works.');
	}
}

async function main() {
	checkDocker();

	console.log(`\n1. Building ${IMAGE}`);
	// The Supabase values are fake: the app only needs them to exist. Readiness will report "degraded" (not 503).
	docker(
		[
			'build', '-t', IMAGE,
			'--build-arg', 'PUBLIC_SUPABASE_URL=https://smoke-test.invalid',
			'--build-arg', 'PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_smoke_test',
			'--build-arg', `APP_VERSION=${VERSION}`,
			'--build-arg', 'GIT_SHA=smoke123',
			'.',
		],
		{ stdio: 'inherit' },
	);

	console.log('\n2. Starting the container');
	const port = await freePort();
	docker(['run', '-d', '--name', NAME, '-p', `127.0.0.1:${port}:4321`, IMAGE]);
	containerStarted = true;

	console.log('\n3. HTTP checks');
	const httpResults = await runHttpChecks({ baseUrl: `http://127.0.0.1:${port}`, expectVersion: VERSION });
	results.push(...httpResults);

	console.log('\n4. Container checks');
	const uid = docker(['exec', NAME, 'id', '-u']);
	record('runs as a non-root user', uid !== '0', `uid ${uid}`);

	const deadline = Date.now() + 60_000;
	let health = '';
	while (Date.now() < deadline) {
		health = docker(['inspect', '-f', '{{.State.Health.Status}}', NAME]);
		if (health === 'healthy') break;
		await sleep(2000);
	}
	record('Docker HEALTHCHECK becomes healthy', health === 'healthy', `status "${health}"`);

	const sizeMb = Math.round(Number(docker(['image', 'inspect', '-f', '{{.Size}}', IMAGE])) / 1_048_576);
	record(`image is under ${MAX_IMAGE_MB} MB`, sizeMb <= MAX_IMAGE_MB, `${sizeMb} MB`);

	console.log('\n5. Graceful shutdown (docker stop sends SIGTERM)');
	const started = Date.now();
	docker(['stop', '-t', '20', NAME]);
	const seconds = Math.round((Date.now() - started) / 100) / 10;
	const exitCode = docker(['inspect', '-f', '{{.State.ExitCode}}', NAME]);
	record('exits cleanly with code 0 (not force-killed)', exitCode === '0', `exit code ${exitCode}, took ${seconds}s`);
}

let crashed = false;
try {
	await main();
} catch (error) {
	crashed = true;
	console.error(`\nSmoke test stopped: ${error instanceof Error ? error.message : error}`);
	if (containerStarted) {
		try {
			console.error('\n--- last container logs ---');
			console.error(docker(['logs', '--tail', '30', NAME]));
		} catch {
			// The container may have exited or been removed already.
		}
	}
} finally {
	if (containerStarted) {
		try {
			docker(['rm', '-f', NAME], { stdio: 'ignore' });
		} catch {
			// The container may have been removed already.
		}
	}
}

const failed = results.filter((result) => !result.ok);
if (crashed || failed.length) {
	console.log(`\nSMOKE TEST FAILED${failed.length ? `: ${failed.length} check(s)` : ''}`);
	process.exit(1);
}
console.log(`\nSMOKE TEST PASSED (${results.length} checks)`);
