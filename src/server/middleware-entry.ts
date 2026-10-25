// The file Astro loads as middleware in the server build (registered in astro.config.mjs).
import './startup';
import { logger } from './default-logger';
import { createRequestLogger } from './request-logger';

export const onRequest = createRequestLogger({ logger });
