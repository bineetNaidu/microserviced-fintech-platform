import { z } from 'zod';
import { baseEnvSchema } from './base';

/**
 * Validates, merges, and freezes system configurations during container bootstrap.
 * If validation fails, this execution block prints formatted schema diagnostics and forces
 * an immediate SIGTERM process exit to prevent running a misconfigured service container.
 * @typeParam T - ZodRawShape mapping out the microservice-specific runtime parameters
 * @param serviceSchema - The custom validation schema fields provided by the boot microservice
 * @returns Fully type-safe runtime configuration object encompassing core and service environments
 */
export function loadEnvironment<T extends z.ZodRawShape>(serviceSchema: T) {
  // Combine the standard base environment variables with service-specific ones
  const finalSchema = baseEnvSchema.extend(serviceSchema);

  const result = finalSchema.safeParse(process.env);

  if (!result.success) {
    console.error('\n❌ ================================================================');
    console.error('❌ CRITICAL ENGINE CONFIGURATION RUNTIME VALIDATION FAILED!');
    console.error('❌ The service process is aborting initialization to prevent runtime faults.');
    console.error('❌ Missing/Invalid Environment Mapping Breakdown:');
    console.error(JSON.stringify(result.error.format(), null, 2));
    console.error('❌ ================================================================\n');
    process.exit(1);
  }

  return result.data as z.infer<typeof finalSchema>;
}
