import { appErrorFromResponse, messageForCode, messageForError, SPEC_ERROR_CODES } from "../src/core/errors";

// Every code in Docs/spec/05-error-codes.md.
const SPEC_CODES = [
  "VALIDATION_ERROR", "UNKNOWN_EVENT_TYPE", "INVALID_DISCOUNT_CODE", "UNAUTHENTICATED", "PAYMENT_DECLINED",
  "PAYMENT_CAPTURE_FAILED", "FORBIDDEN", "SPORT_NOT_FOUND", "MATCH_NOT_FOUND", "LEAGUE_NOT_FOUND", "EVENT_NOT_FOUND",
  "PLAYER_NOT_FOUND", "SQUAD_NOT_FOUND", "VARIANT_NOT_FOUND", "SPORT_EXISTS", "LEAGUE_EXISTS", "MATCH_EXISTS",
  "DUPLICATE_EVENT_ID", "DUPLICATE_ORDER_ID", "ILLEGAL_TRANSITION", "MATCH_NOT_IN_PROGRESS", "TIE_NOT_ALLOWED",
  "INNINGS_COMPLETE", "SERIES_ALREADY_DECIDED", "INVALID_COMPENSATION", "NO_VALID_PAIRING", "OUT_OF_STOCK",
  "CROSS_TENANT_TRANSFER", "NOT_IN_SQUAD", "TRANSFER_WINDOW_CLOSED", "PLAYER_ON_LOAN", "SQUAD_FULL",
  "MIN_POSITION_VIOLATION", "INVALID_BASE_VERSION", "PAYLOAD_TOO_LARGE", "RATE_LIMITED",
];

describe("error messages", () => {
  it("covers every spec error code with a plain-language message", () => {
    for (const code of SPEC_CODES) {
      expect(SPEC_ERROR_CODES).toContain(code);
      const msg = messageForCode(code);
      expect(msg).not.toMatch(/[A-Z]{3,}_[A-Z]+/); // never a raw code
      expect(msg.length).toBeGreaterThan(10);
    }
  });

  it("maps HTTP responses to AppError kinds", () => {
    expect(appErrorFromResponse(401, {})).toEqual({ kind: "unauthenticated" });
    expect(appErrorFromResponse(409, { error: { code: "OUT_OF_STOCK", message: "x", details: { variant_id: "v" } } })).toEqual({
      kind: "conflict",
      code: "OUT_OF_STOCK",
      details: { variant_id: "v" },
    });
    expect(appErrorFromResponse(429, {}, "7")).toEqual({ kind: "rateLimited", retryAfterSec: 7 });
    expect(appErrorFromResponse(500, "oops")).toEqual({ kind: "server" });
  });

  it("humanises validation fields and never shows status numbers", () => {
    const e = appErrorFromResponse(400, { error: { code: "VALIDATION_ERROR", message: "", details: { fields: ["effective_date"] } } });
    expect(messageForError(e)).toBe("Please check: effective date.");
    expect(messageForError({ kind: "server" })).not.toMatch(/500/);
    expect(messageForError({ kind: "offline" })).toBe("You're offline. Showing saved data.");
  });
});
