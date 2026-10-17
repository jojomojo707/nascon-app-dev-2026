// AppError taxonomy and the error-code -> plain-language table (mobile/architecture/10).
// The server's raw message is never shown; the code picks the text.

export type AppError =
  | { kind: "offline" }
  | { kind: "timeout" }
  | { kind: "unauthenticated" }
  | { kind: "forbidden" }
  | { kind: "notFound"; code: string }
  | { kind: "conflict"; code: string; details: Record<string, unknown> }
  | { kind: "payment"; code: string }
  | { kind: "validation"; code: string; fields: string[] }
  | { kind: "rateLimited"; retryAfterSec: number }
  | { kind: "payloadTooLarge" }
  | { kind: "server" };

const CODE_MESSAGES: Record<string, string> = {
  UNAUTHENTICATED: "Your session expired. Please sign in again.",
  FORBIDDEN: "You don't have permission to do this.",
  UNKNOWN_EVENT_TYPE: "This scoring option isn't valid for this sport.",
  INVALID_DISCOUNT_CODE: "That discount code isn't valid.",
  PAYMENT_DECLINED: "Payment was declined. You were not charged.",
  PAYMENT_CAPTURE_FAILED: "Payment couldn't be completed. You were not charged.",
  SPORT_NOT_FOUND: "This sport no longer exists.",
  MATCH_NOT_FOUND: "This match no longer exists.",
  LEAGUE_NOT_FOUND: "This league no longer exists.",
  EVENT_NOT_FOUND: "The event you tried to correct wasn't found.",
  PLAYER_NOT_FOUND: "That player wasn't found.",
  SQUAD_NOT_FOUND: "That squad wasn't found.",
  VARIANT_NOT_FOUND: "This product option is no longer available.",
  SPORT_EXISTS: "This already exists.",
  LEAGUE_EXISTS: "This already exists.",
  MATCH_EXISTS: "This already exists.",
  DUPLICATE_EVENT_ID: "This was already submitted with different details.",
  DUPLICATE_ORDER_ID: "This was already submitted with different details.",
  ILLEGAL_TRANSITION: "The match can't change to that status right now.",
  MATCH_NOT_IN_PROGRESS: "Scores can only be added while the match is in progress.",
  TIE_NOT_ALLOWED: "Scores are level and this sport needs a winner. Record the tie-break winner first.",
  INNINGS_COMPLETE: "This team's innings is already over.",
  SERIES_ALREADY_DECIDED: "This series is already decided.",
  INVALID_COMPENSATION: "This event can't be corrected (already corrected or wrong type).",
  NO_VALID_PAIRING: "No valid pairing exists for this round.",
  OUT_OF_STOCK: "Sorry, this item just sold out.",
  CROSS_TENANT_TRANSFER: "Players can only move between clubs in your organisation.",
  NOT_IN_SQUAD: "This player is no longer in that squad. The list was refreshed.",
  TRANSFER_WINDOW_CLOSED: "The transfer window is closed for that date.",
  PLAYER_ON_LOAN: "This player is on loan and can't be moved until the loan ends.",
  SQUAD_FULL: "The destination squad is full.",
  MIN_POSITION_VIOLATION: "The club would have too few players in this position.",
  INVALID_BASE_VERSION: "Your device was out of date. The server version was kept.",
  PAYLOAD_TOO_LARGE: "That request is too large.",
  RATE_LIMITED: "Too many requests. Please wait a few seconds.",
  VALIDATION_ERROR: "Some details are missing or not valid. Please check and try again.",
};

/** Every error code in Docs/spec/05-error-codes.md (used by tests to prove full coverage). */
export const SPEC_ERROR_CODES = Object.keys(CODE_MESSAGES);

/** Plain-language text for a server error code (used for sync results too). */
export function messageForCode(code: string | null | undefined): string {
  if (!code) return "Something went wrong. Please try again.";
  return CODE_MESSAGES[code] ?? "The server couldn't accept this change.";
}

function humanizeField(f: string): string {
  const last = f.split(".").pop() ?? f;
  return last.replace(/_/g, " ");
}

export function messageForError(e: AppError): string {
  switch (e.kind) {
    case "offline":
      return "You're offline. Showing saved data.";
    case "timeout":
      return "The server is taking too long. Please try again.";
    case "unauthenticated":
      return CODE_MESSAGES.UNAUTHENTICATED;
    case "forbidden":
      return CODE_MESSAGES.FORBIDDEN;
    case "rateLimited":
      return `Too many requests. Please wait ${e.retryAfterSec} seconds.`;
    case "payloadTooLarge":
      return CODE_MESSAGES.PAYLOAD_TOO_LARGE;
    case "server":
      return "Something went wrong on the server. Please try again.";
    case "validation":
      if (e.code === "VALIDATION_ERROR" && e.fields.length > 0) {
        return `Please check: ${e.fields.map(humanizeField).join(", ")}.`;
      }
      return messageForCode(e.code);
    default:
      return messageForCode(e.code);
  }
}

/** Build an AppError from an HTTP status + spec error body ({"error":{code,message,details}}). */
export function appErrorFromResponse(status: number, body: unknown, retryAfter?: string | null): AppError {
  const err = (body as { error?: { code?: string; details?: Record<string, unknown> } } | null)?.error;
  const code = typeof err?.code === "string" ? err.code : "";
  const details = err?.details && typeof err.details === "object" ? err.details : {};
  if (status === 401) return { kind: "unauthenticated" };
  if (status === 403) return { kind: "forbidden" };
  if (status === 404) return { kind: "notFound", code: code || "NOT_FOUND" };
  if (status === 409) return { kind: "conflict", code, details };
  if (status === 402) return { kind: "payment", code: code || "PAYMENT_DECLINED" };
  if (status === 413) return { kind: "payloadTooLarge" };
  if (status === 429) {
    const n = Number(retryAfter);
    return { kind: "rateLimited", retryAfterSec: Number.isFinite(n) && n > 0 ? Math.ceil(n) : 10 };
  }
  if (status === 400) {
    const fields = Array.isArray(details.fields) ? (details.fields as unknown[]).map(String) : [];
    return { kind: "validation", code: code || "VALIDATION_ERROR", fields };
  }
  return { kind: "server" };
}

export function errorCode(e: AppError): string | null {
  return "code" in e ? e.code : null;
}
