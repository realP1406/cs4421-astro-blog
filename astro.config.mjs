
 // @ts-check

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig, fontProviders } from 'astro/config';
import node from '@astrojs/node';
import { fileURLToPath } from 'node:url';

// DEPLOY_TARGET=server builds a Node server; anything else builds plain static files.
const isServer = process.env.DEPLOY_TARGET === 'server';

// Absolute path to a file in this project (Astro needs absolute paths for injected routes and middleware).
/** @param {string} path */
const fromRoot = (path) => fileURLToPath(new URL(path, import.meta.url));

// Everything that only makes sense on a running server. Added for the server build only.
/** @type {import('astro').AstroIntegration} */
const serverFeatures = {
	name: 'server-features',
	hooks: {
		'astro:config:setup': ({ injectRoute, addMiddleware }) => {
			injectRoute({ pattern: '/api/health', entrypoint: fromRoot('./src/server-routes/health.ts'), prerender: false });
			injectRoute({ pattern: '/api/livez', entrypoint: fromRoot('./src/server-routes/livez.ts'), prerender: false });
			injectRoute({ pattern: '/api/readyz', entrypoint: fromRoot('./src/server-routes/readyz.ts'), prerender: false });
			injectRoute({ pattern: '/api/version', entrypoint: fromRoot('./src/server-routes/version.ts'), prerender: false });
			addMiddleware({ entrypoint: fromRoot('./src/server/middleware-entry.ts'), order: 'pre' });
		},
	},
};

// https://astro.build/config
export default defineConfig({
	site: 'https://example.com',

	output: isServer ? 'server' : 'static',
	adapter: isServer ? node({ mode: 'standalone' }) : undefined,
	integrations: [mdx(), sitemap(), ...(isServer ? [serverFeatures] : [])],

	fonts: [
		{
			provider: fontProviders.local(),
			name: 'Atkinson',
			cssVariable: '--font-atkinson',
			fallbacks: ['sans-serif'],
			options: {
				variants: [
					{
						src: ['./src/assets/fonts/atkinson-regular.woff'],
						weight: 400,
						style: 'normal',
						display: 'swap',
					},
					{
						src: ['./src/assets/fonts/atkinson-bold.woff'],
						weight: 700,
						style: 'normal',
						display: 'swap',
					},
				],
			},
		},
	],
});
