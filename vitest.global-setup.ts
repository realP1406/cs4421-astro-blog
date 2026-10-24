// Run every test in UTC so date maths gives the same result on every machine and in CI.
export default function setup(): void {
	process.env.TZ = 'UTC';
}
