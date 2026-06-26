import { z } from 'zod';
import { baseEnvSchema } from './base';

export function loadEnvironment<T extends z.ZodRawShape>(serviceSchema: T) {
  // Combine the standard base environment variables with service-specific ones
  const finalSchema = baseEnvSchema.extend(serviceSchema);

  const result = finalSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ CRITICAL: Environment configuration validation failed!');
    console.error(JSON.stringify(result.error.format(), null, 2));
    process.exit(1); // Force immediate crash on boot
  }

  return result.data as z.infer<typeof finalSchema>;
}
