# 🌐 Production Architectural Manual: API Gateway (`services/api-gateway/`)

The API Gateway is the **Edge Proxy and Security Guard** of the platform. It serves as the single entry point for all client traffic, translating public HTTP requests into internal microservice invocations. It operates statelessly, processing reverse-proxy routing, cryptographic asymmetric JWT verification, and global rate limiting at the infrastructure edge before traffic enters the cluster private network mesh.

---

## 1. Architectural Role & Security Invariants

The gateway implements a zero-trust boundary. Internal services completely trust the headers injected by the gateway because the gateway is the only component exposed to the public internet.

### Header Injection Protocol

Upon receiving an asymmetric token (`RS256`), the gateway validates the cryptographic signature using the Auth Service's public key. It extracts the token claims and strips any client-supplied variations of the following headers, re-injecting them with trusted values before forwarding the request downstream:

- `X-User-ID`: The unique, validated User UUID (`sub` claim).
- `X-User-Role`: The user's access level (`customer`, `admin`, etc.).
- `X-Correlation-ID`: An auto-generated or client-supplied trace ID propagated via `AsyncLocalStorage` across the entire service call tree to maintain absolute trace logging.

---

## 2. Runtime Processing Pipeline & Routing Rules

The gateway does not maintain a database per se; instead, it utilizes a high-performance **Redis cluster** to track rate-limiting buckets, IP reputation metrics, and the immediate JWT logout blocklist.

```text
[ Public Client Request ]
           │
           ▼
┌──────────────────────────────────────┐
│  1. Global Rate Limiter (Redis)      │ ──► Limit Exceeded ──► [ 429 Too Many Requests ]
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│  2. Path Matching & Cors Validation  │ ──► Invalid Path  ──► [ 404 Not Found ]
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│  3. Cryptographic JWT Verification   │ ──► Invalid Signature ──► [ 401 Unauthorized ]
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│  4. Redis Blocklist Check (Logout)   │ ──► Token Blocked ──► [ 401 Unauthorized ]
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│  5. Header Injection & Proxy Pass    │ ──► Forwarding Downstream to Private Mesh
└──────────────────────────────────────┘

```

### Routing Matrix Configuration (`shared-config` Mapping)

The gateway maps prefixes dynamically using the central route registry:

- `/api/v1/auth/*` ──► Proxies directly to `http://auth-service:3000/v1/auth/*` _(Public Bypass)_
- `/api/v1/users/*` ──► Verifies JWT, injects headers, proxies to `http://user-service:3000/v1/users/*`
- `/api/v1/accounts/*` ──► Verifies JWT, injects headers, proxies to `http://account-service:3000/v1/accounts/*`
- `/api/v1/transfers/*` ──► Verifies JWT, enforces header idempotency keys, proxies to `http://transfer-service:3000/v1/transfers/*`

---

## 3. API Path Matrix & Payload Contracts

### Global Rate Limiting Spec (Token Bucket Algorithm)

- **Public Endpoints (`/auth/login`, `/auth/register`):** 5 requests per IP per minute.
- **Private Authenticated Endpoints:** 100 requests per authenticated `X-User-ID` per minute.
- **Burst Capacity Allowance:** A maximum burst multiplier of 1.5x bucket capacity for handling web socket initializations or immediate page reloads without dropping connections.

### Error Response Contract Enforcement

If a request fails anywhere inside the gateway pipeline, it must bypass the downstream services and output our uniform error envelope directly:

```json
{
  "success": false,
  "data": null,
  "meta": null,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "The provided access token has expired or been explicitly revoked via logout.",
    "traceId": "corr_gateway_01H7X7..."
  }
}
```

---

## 4. Comprehensive Testing Strategy

### Unit Testing Targets (Vitest)

- **JWT Signature Verification:** Feed the gateway validation engine a token tampered with by a single character. Assert that the verification fails instantly, rejecting the routing cycle before any upstream network proxies are evaluated.
- **Header Stripping Security Guard:** Send a request containing a malicious pre-filled header `X-User-ID: admin-uuid` to an authenticated route. Assert that the gateway cleanly purges this header and overwrites it with the true, token-extracted customer identity string.

### Integration Testing Targets (Docker-Isolated Environment)

- **Distributed Rate Limiting Multi-Hit:** Fire 105 rapid concurrent HTTP hits using an automated worker pool against a token-bound endpoint using a valid session. Assert that the first 100 calls respond with a clean `200 OK` or `202 Accepted`, while the remaining 5 explicitly drop into a `429 Too Many Requests` state with matching Redis key increases.
- **Redis Blocklist Interception Validation:** Inject a token identifier `jti` directly into the mock Redis container with a 15-minute TTL (simulating an active logout execution). Immediately issue an authorized endpoint request using that exact token. Assert that the gateway catches the blocklist match and cuts the execution loop with a strict `401 Unauthorized`.

### Chaos Testing Matrix

- **Redis Cluster Partition Failure:** Sever the network link between the API Gateway and the Redis cluster backing rate-limiting and logout checks. Verify that the gateway fallback loop **fails secure** (refusing to proxy traffic if it cannot explicitly verify logout blocklists) or shifts into a fallback localized emergency caching array to maintain system integrity under duress.
