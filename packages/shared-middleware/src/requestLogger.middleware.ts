import type { Request, Response, NextFunction } from 'express';

/**
 * ANSI escape code color map for terminal output.
 *
 * Colors are ONLY applied in development mode (NODE_ENV !== 'production').
 * In production, structured JSON is emitted to stdout without any ANSI codes —
 * log aggregators (Loki, Datadog, ELK, CloudWatch) cannot parse colorized text.
 *
 * ─── COLOR LEGEND ────────────────────────────────────────────────────────────
 * HTTP Methods:
 *   GET     → cyan    (safe, read-only operations)
 *   POST    → green   (creates something new)
 *   PUT     → yellow  (replaces a resource)
 *   PATCH   → magenta (partial update)
 *   DELETE  → red     (destructive, catch the eye)
 *   OPTIONS → gray    (preflight, boring)
 *
 * Status codes:
 *   2xx → green   (all good)
 *   3xx → cyan    (redirects — informational)
 *   4xx → yellow  (client errors — attention needed)
 *   5xx → red     (server errors — critical, fix immediately)
 *
 * Duration (response time):
 *   < 100ms  → green   (fast — within SLA)
 *   < 500ms  → yellow  (moderate — watch this)
 *   ≥ 500ms  → red     (slow — investigate immediately)
 */
const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
} as const;

type ColorKey = keyof typeof COLORS;

/** True only during local development — controls colorized vs JSON log output */
const isDev = process.env.NODE_ENV === 'development';

/**
 * Wraps text with ANSI color codes in development, returns plain text in production.
 * This single function ensures we never accidentally send ANSI codes to a log aggregator.
 */
function c(text: string, color: ColorKey): string {
  return isDev ? `${COLORS[color]}${text}${COLORS.reset}` : text;
}

/** Maps HTTP method string to the appropriate display color key */
function methodColor(method: string): ColorKey {
  const map: Record<string, ColorKey> = {
    GET: 'cyan',
    POST: 'green',
    PUT: 'yellow',
    PATCH: 'magenta',
    DELETE: 'red',
    OPTIONS: 'gray',
    HEAD: 'gray',
  };
  return map[method.toUpperCase()] ?? 'white';
}

/** Maps HTTP status code to a color key based on severity class */
function statusColor(code: number): ColorKey {
  if (code >= 500) {
    return 'red';
  }
  if (code >= 400) {
    return 'yellow';
  }
  if (code >= 300) {
    return 'cyan';
  }
  return 'green';
}

/** Maps request duration to a color key based on performance thresholds */
function durationColor(ms: number): ColorKey {
  if (ms >= 500) {
    return 'red';
  } // Slow — SLA breach, investigate
  if (ms >= 100) {
    return 'yellow';
  } // Moderate — watch trend
  return 'green'; // Fast — within budget
}

/**
 * Structured Request/Response Logger Middleware.
 *
 * ─── WHAT IS LOGGED ──────────────────────────────────────────────────────────
 * Every completed HTTP request produces one log line containing:
 *   • HTTP method + URL path       — what operation was called
 *   • Response status code         — did it succeed or fail
 *   • Response duration (ms)       — how long it took (latency monitoring)
 *   • Correlation ID               — links this log to traces across ALL services
 *   • User ID                      — links requests to accounts (audit trail)
 *   • Content-Length               — response body size (bandwidth monitoring)
 *
 * ─── DIFFERENTIATORS — HOW TO SPOT PROBLEMS AT A GLANCE ─────────────────────
 * In development terminal:
 *   → DELETE /v1/accounts/01J... 500 623ms | trace=abc... user=def... size=128
 *   ↑ Red DELETE, Red 500, Red 623ms → immediately screams "something is wrong"
 *
 *   → GET /v1/health 200 2ms | trace=abc... user=anonymous size=42
 *   ↑ Cyan GET, Green 200, Green 2ms → boring and good, as expected
 *
 * In production (JSON, parsed by log aggregator):
 *   → {"level":"error","status":500,"durationMs":623,"correlationId":"abc..."}
 *   → Loki/Datadog alert fires on level=error, Grafana graphs durationMs histogram
 *
 * ─── WHAT IS NOT LOGGED (INTENTIONAL OMISSIONS) ──────────────────────────────
 * The following are NEVER logged, even in development:
 *   • Request/response body content — may contain PII (SSN, Aadhaar), passwords, card numbers
 *   • Authorization header value    — contains the raw JWT (would be a credential leak)
 *   • Cookie values                 — session tokens are sensitive
 *   • Query parameters on auth routes — may contain tokens or OTPs
 *
 * If you need request body logging for debugging, add it temporarily in a specific
 * service's dev environment with explicit PII filtering. Never commit body logging.
 *
 * ─── LOG TIMING ──────────────────────────────────────────────────────────────
 * We log on the 'finish' event, NOT at request arrival. This is intentional:
 * logging at arrival gives you no status code or duration. Logging at finish gives
 * you the complete picture of what actually happened.
 */
export function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();

  res.on('finish', () => {
    const durationMs = Date.now() - startTime;
    const { method, originalUrl } = req;
    const { statusCode } = res;

    // correlationId is set by traceMiddleware — must run before requestLoggerMiddleware
    const correlationId = req.correlationId ?? 'no-trace';

    // userId is set by createAuthenticateMiddleware — 'anonymous' on public routes
    const userId = req.user?.id ?? 'anonymous';

    // Content-Length may be absent for streaming or empty responses
    const contentLength = res.getHeader('content-length') ?? '-';

    if (isDev) {
      // ── Development: Colorized, human-readable terminal log ─────────────────
      // Pad method to 7 chars for visual alignment across different method lengths
      const methodStr = c(method.padEnd(7), methodColor(method));
      const statusStr = c(statusCode.toString(), statusColor(statusCode));
      const durationStr = c(`${durationMs}ms`, durationColor(durationMs));
      const traceStr = c(correlationId, 'gray');
      const userStr = c(userId, 'gray');
      const urlStr = c(originalUrl, 'white');

      // Arrow differentiates these log lines from service startup/shutdown logs
      process.stdout.write(
        `${c('→', 'bold')} ${methodStr} ${urlStr} ${statusStr} ${durationStr} | ` +
          `trace=${traceStr} user=${userStr} size=${contentLength}\n`,
      );
    } else {
      // ── Production: Structured JSON — one line per request ──────────────────
      // Parseable by any log aggregator (Loki, Datadog, ELK, CloudWatch Logs Insights)
      // Fields are kept flat (not nested) for maximum query compatibility
      const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';

      const logLine = JSON.stringify({
        level,
        msg: `${method} ${originalUrl} ${statusCode}`,
        method,
        url: originalUrl,
        status: statusCode,
        durationMs,
        correlationId,
        userId,
        contentLength,
        timestamp: new Date().toISOString(),
      });

      process.stdout.write(logLine + '\n');
    }
  });

  next();
}
