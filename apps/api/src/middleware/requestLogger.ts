import { pinoHttp } from "pino-http";
import pino from "pino";
import type { IncomingMessage, ServerResponse } from "http";

const LOG_DIR = process.env.LOG_DIR || "./logs";
const LOG_LEVEL = process.env.LOG_LEVEL || "info";

/**
 * Pino transport targets: structured JSON to file + pretty to stdout in dev.
 * File transport writes to LOG_DIR/api.log for persistent offline debugging (FR-039).
 */
function buildTransport(): pino.TransportMultiOptions {
  return {
    targets: [
      {
        target: "pino/file",
        options: { destination: `${LOG_DIR}/api.log`, mkdir: true },
        level: LOG_LEVEL,
      },
      {
        target: "pino-pretty",
        options: { colorize: true },
        level: LOG_LEVEL,
      },
    ],
  };
}

/**
 * Structured HTTP request/error logging middleware (FR-039).
 *
 * Produces JSON entries with: req.id, req.method, req.url, res.statusCode, responseTime.
 * Sensitive headers (authorization, cookie) are redacted.
 * Logging failures do not propagate to API responses.
 */
export const requestLogger = pinoHttp({
  transport: buildTransport(),
  level: LOG_LEVEL,

  // Auto-generate unique request ID when not provided by proxy
  genReqId: (req: IncomingMessage) =>
    (req.headers["x-request-id"] as string) || crypto.randomUUID(),

  // Redact sensitive headers
  serializers: {
    req(req: Record<string, any>) {
      return {
        id: req.id,
        method: req.method,
        url: req.url,
        // Exclude authorization and cookie headers from logs
        headers: Object.fromEntries(
          Object.entries(req.headers || {}).filter(
            ([key]) => !["authorization", "cookie"].includes(key.toLowerCase())
          )
        ),
      };
    },
    res(res: Record<string, any>) {
      return {
        statusCode: res.statusCode,
      };
    },
  },

  // Use error level for failed requests (status >= 400)
  customLogLevel(
    _req: IncomingMessage,
    res: ServerResponse,
    error: Error | undefined
  ) {
    if (error || (res.statusCode && res.statusCode >= 500)) return "error";
    if (res.statusCode && res.statusCode >= 400) return "warn";
    return "info";
  },
});
