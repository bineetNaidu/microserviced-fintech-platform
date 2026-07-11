import type { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Header Injection Middleware (Pipeline Stage 5).
 *
 * ─── THE ZERO-TRUST HEADER PATTERN ────────────────────────────────────────────
 * Downstream microservices SHOULD NOT re-verify JWTs themselves.
 * That would mean every service needs:
 *   - The JWT_PUBLIC_KEY environment variable
 *   - Jose / JWT verification code
 *   - Their own blocklist Redis connection (or API calls to auth service)
 *
 * Instead, we use the GATEWAY AS THE TRUST BOUNDARY:
 *   1. Gateway verifies the JWT cryptographically (RS256 signature + exp)
 *   2. Gateway checks the Redis blocklist (revocation check)
 *   3. Gateway strips the original Authorization header
 *   4. Gateway injects trusted HTTP headers with the verified claims
 *   5. Downstream services read these headers — they trust them implicitly
 *
 * CRITICAL SECURITY CONTRACT:
 * The trusted headers (X-User-Id, X-User-Role, etc.) MUST ONLY come from the gateway.
 * No external client can reach a downstream service directly — traffic MUST go through
 * the gateway (enforced by K8s NetworkPolicy in k8s/base/).
 *
 * If a client sends X-User-Id: someUUID directly to the gateway, this middleware
 * strips and OVERWRITES it with the verified value from the JWT.
 * This prevents header injection attacks.
 *
 * ─── WHY STRIP THE AUTHORIZATION HEADER? ─────────────────────────────────────
 * After the gateway verifies the JWT, the downstream services don't need it anymore.
 * Forwarding the raw JWT to downstream services:
 *   1. Increases payload size on every request
 *   2. Could cause the service to try re-verifying it (unnecessary CPU)
 *   3. Could cause issues if the downstream service doesn't have the public key
 *
 * Stripping it also enforces the zero-trust contract: downstream services should
 * ONLY trust the gateway-injected headers, never raw tokens.
 *
 * ─── HEADER NAME CONVENTIONS ──────────────────────────────────────────────────
 * All injected headers are prefixed with `X-` (non-standard extension headers).
 * All services must read from these exact names — treat them as an internal API contract.
 *
 * X-User-Id          → req.user.id       (UUID)
 * X-User-Email       → req.user.email    (email address)
 * X-User-Role        → req.user.role     (UserRole enum value)
 * X-User-Permissions → req.user.permissions (JSON-serialized string array)
 * X-Correlation-Id   → req.correlationId (trace identifier for distributed logging)
 */
export function headerInjectionMiddleware(): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    // If req.user is not populated, this is a public route (no JWT was verified).
    // In that case, we still strip any client-provided trusted headers for safety,
    // but we don't inject new ones.
    if (req.user) {
      // ─── Remove the raw JWT from the forwarded request ─────────────────
      // Downstream services should not process the JWT themselves — they trust the headers.
      delete req.headers['authorization'];

      // ─── Inject verified identity headers ──────────────────────────────
      // These are set from the VERIFIED JWT payload — not from the client request.
      // Any client-provided X-User-* headers are overwritten here.
      req.headers['x-user-id'] = req.user.id;
      req.headers['x-user-email'] = req.user.email;
      req.headers['x-user-role'] = req.user.role;

      // Permissions array is serialized to JSON for transport over HTTP headers.
      // Downstream services parse it: JSON.parse(req.headers['x-user-permissions'] as string)
      req.headers['x-user-permissions'] = JSON.stringify(req.user.permissions);
    } else {
      // ─── Strip any spoofed trusted headers from public route requests ───
      // Even on public routes (where we skip JWT verification), we must delete
      // any client-provided X-User-* headers to prevent header injection attacks
      // where a client pretends to be authenticated at the HTTP header level.
      delete req.headers['x-user-id'];
      delete req.headers['x-user-email'];
      delete req.headers['x-user-role'];
      delete req.headers['x-user-permissions'];
    }

    // ─── Always forward the correlation ID ───────────────────────────────
    // The correlation ID is set by traceMiddleware() (runs before this middleware).
    // It propagates to downstream services for distributed request tracing.
    // Downstream services read this as req.headers['x-correlation-id'].
    if (req.correlationId) {
      req.headers['x-correlation-id'] = req.correlationId;
    }

    next();
  };
}
