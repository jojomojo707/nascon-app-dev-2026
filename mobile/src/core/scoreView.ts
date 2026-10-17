// Score rendering and scoring-button labels. Branches ONLY on scoring_model, never on a
// sport or event name; event labels come from the sport config keys.
import { humanize } from "./format";

type Side = { score: number; wickets: number | null; overs: string | null };
type EventDef = { points?: number; runs?: number; rounds?: number; wicket?: boolean };

export function sideScoreText(model: string | undefined, side: Side): string {
  if (model === "innings") {
    const w = side.wickets ?? 0;
    return `${side.score}/${w}${side.overs ? ` (${side.overs} ov)` : ""}`;
  }
  return String(side.score);
}

export function scoreHeadline(model: string | undefined, home: Side, away: Side): string {
  if (model === "round") return `Rounds ${home.score} – ${away.score}`;
  return `${sideScoreText(model, home)} – ${sideScoreText(model, away)}`;
}

export function eventButtonLabel(model: string | undefined, key: string, def: EventDef): string {
  const name = humanize(key);
  if (model === "innings") {
    const runs = def.runs ?? 0;
    return `${name} · ${runs} run${runs === 1 ? "" : "s"}${def.wicket ? " + wicket" : ""}`;
  }
  if (model === "round") {
    const r = def.rounds ?? 1;
    return `${name} · ${r} round${r === 1 ? "" : "s"}`;
  }
  const p = def.points ?? 0;
  return `${name} · +${p}`;
}

export function statusLabel(status: string | null | undefined): { text: string; icon: string } {
  switch ((status ?? "").toLowerCase()) {
    case "upcoming":
    case "scheduled":
      return { text: "Upcoming", icon: "calendar-clock" };
    case "in_progress":
      return { text: "In progress", icon: "play-circle-outline" };
    case "completed":
      return { text: "Completed", icon: "flag-checkered" };
    case "postponed":
      return { text: "Postponed", icon: "calendar-refresh" };
    case "abandoned":
      return { text: "Abandoned", icon: "weather-lightning-rainy" };
    case "cancelled":
      return { text: "Cancelled", icon: "cancel" };
    default:
      return { text: status ? humanize(status) : "Unknown", icon: "help-circle-outline" };
  }
}

export function qualificationLabel(status: string): { text: string; icon: string } {
  if (status === "clinched") return { text: "Clinched", icon: "check-decagram" };
  if (status === "eliminated") return { text: "Eliminated", icon: "close-circle-outline" };
  return { text: "Still possible", icon: "progress-question" };
}

/** Human description of a timeline event (type + payload), using config keys only. */
export function describeEvent(type: string, payload: Record<string, unknown>, teamName: (id: string) => string): string {
  const team = typeof payload.team_id === "string" ? teamName(payload.team_id) : null;
  switch (type) {
    case "match_init":
      return "Match created";
    case "match_start":
      return "Match started";
    case "match_end":
      return "Match ended";
    case "score":
      return `${humanize(String(payload.event_type ?? "score"))}${team ? ` · ${team}` : ""}`;
    case "discipline":
      return `Discipline ${payload.points ?? ""}${team ? ` · ${team}` : ""}`;
    case "tiebreak_winner":
      return `Tie-break won${team ? ` · ${team}` : ""}`;
    case "compensation":
      return `Correction${payload.reason ? `: ${String(payload.reason)}` : ""}`;
    default:
      return humanize(type);
  }
}
