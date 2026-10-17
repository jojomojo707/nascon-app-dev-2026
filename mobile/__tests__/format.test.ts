/// <reference types="jest" />
import { formatMoney, humanize, isoNowUtc, isValidDate } from "../src/core/format";
import { eventButtonLabel, scoreHeadline } from "../src/core/scoreView";
import { normaliseServerUrl } from "../src/core/url";

describe("formatting", () => {
  it("formats paisa as PKR with two decimals", () => {
    expect(formatMoney(450000)).toBe("PKR 4,500.00");
    expect(formatMoney(405000)).toBe("PKR 4,050.00");
    expect(formatMoney(5)).toBe("PKR 0.05");
    expect(formatMoney(0)).toBe("PKR 0.00");
  });

  it("emits UTC timestamps without milliseconds", () => {
    expect(isoNowUtc(new Date("2026-10-17T11:00:00.123Z"))).toBe("2026-10-17T11:00:00Z");
  });

  it("validates calendar dates", () => {
    expect(isValidDate("2026-09-30")).toBe(true);
    expect(isValidDate("2026-02-30")).toBe(false);
    expect(isValidDate("30-09-2026")).toBe(false);
  });

  it("labels scoring buttons from config keys and model only", () => {
    expect(humanize("raid_point")).toBe("Raid point");
    expect(eventButtonLabel("event", "raid_point", { points: 1 })).toBe("Raid point · +1");
    expect(eventButtonLabel("innings", "super_six", { runs: 6 })).toBe("Super six · 6 runs");
    expect(eventButtonLabel("round", "map_win", { rounds: 1 })).toBe("Map win · 1 round");
  });

  it("renders score headlines by scoring model", () => {
    const h = { score: 145, wickets: 6, overs: "18.3" };
    const a = { score: 120, wickets: 10, overs: "20.0" };
    expect(scoreHeadline("innings", h, a)).toBe("145/6 (18.3 ov) – 120/10 (20.0 ov)");
    expect(scoreHeadline("event", { score: 2, wickets: null, overs: null }, { score: 1, wickets: null, overs: null })).toBe("2 – 1");
    expect(scoreHeadline("round", { score: 1, wickets: null, overs: null }, { score: 2, wickets: null, overs: null })).toBe("Rounds 1 – 2");
  });

  it("normalises server addresses", () => {
    expect(normaliseServerUrl("192.168.1.5:8080")).toBe("http://192.168.1.5:8080");
    expect(normaliseServerUrl("http://10.0.2.2:8080/")).toBe("http://10.0.2.2:8080");
    expect(normaliseServerUrl("not a url")).toBeNull();
  });
});
