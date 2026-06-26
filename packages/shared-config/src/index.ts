export * from './env/base';
export * from './env/loader';
export * from './routes';

/**
 * When an individual service (like transfer-service) boots up, its src/config/index.ts file will use this module like this:
    TypeScript

    import { loadEnvironment } from '@fintech/shared-config';
    import { z } from 'zod';

    // Define parameters specific only to the transfer microservice
    export const config = loadEnvironment({
        DATABASE_URL: z.string().url(),
        RABBITMQ_URL: z.string().url(),
        REDIS_URL: z.string().url(),
    });
 * 
 */
