// Response shapes from Docs/spec and the PROPOSED /api/v1 routes (mobile/architecture/07).
// Every field is optional-tolerant: the UI never crashes if the backend adds or omits a field.

export type League = { league_id: string; name?: string | null; sport_id?: string | null; tenant_id?: string | null; season?: string | null };

export type TeamRef = { team_id: string; name?: string | null; score?: number | null };

export type Fixture = {
  match_id: string;
  home: TeamRef | string;
  away: TeamRef | string;
  scheduled_at?: string | null;
  venue?: string | null;
  status?: string | null;
};

export type StandingsRow = {
  rank: number;
  team_id: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  scored: number;
  conceded: number;
  diff: number;
  points: number;
  fair_play: number;
  status: "clinched" | "eliminated" | "still_possible" | string;
  resolved_by: string | null;
};

export type Standings = {
  league_id: string;
  sport_id?: string;
  qualification_spots?: number;
  table: StandingsRow[];
  team_names?: Record<string, string>;
};

export type SportConfig = {
  sport_id: string;
  name?: string;
  scoring_model: "event" | "innings" | "round";
  periods?: Record<string, number>;
  scoring_events: Record<string, { points?: number; runs?: number; rounds?: number; legal_ball?: boolean; wicket?: boolean }>;
  draw_allowed?: boolean;
};

export type ScoreSide = {
  team_id: string;
  score: number;
  wickets: number | null;
  balls: number | null;
  overs: string | null;
  fair_play: number;
};

export type MatchEvent = {
  sequence: number;
  event_id: string;
  type: string;
  payload: Record<string, unknown>;
  signature?: string;
  compensated: boolean;
  compensated_by: string | null;
};

export type Score = {
  match_id: string;
  sport_id: string;
  league_id?: string | null;
  status: string;
  outcome: string;
  winner_team_id: string | null;
  tiebreak_winner_team_id?: string | null;
  home: ScoreSide;
  away: ScoreSide;
  version: number;
  events: MatchEvent[];
  team_names?: Record<string, string>;
};

export type PinnedProduct = { product_id: string; name: string; image_url?: string | null; price_minor?: number };

export type ClubSummary = { club_id: string; name: string; logo_url?: string | null };

export type RosterPlayer = {
  player_id: string;
  name: string;
  position?: string | null;
  role?: string | null;
  squad_id?: string | null;
  league_id?: string | null;
  on_loan?: boolean | null;
  parent_squad_id?: string | null;
};

export type Club = {
  club_id: string;
  name: string;
  logo_url?: string | null;
  home_venue?: { name?: string; lat?: number; lng?: number } | null;
  socials?: Record<string, string> | null;
  staff?: { name: string; role: string }[] | null;
  roster?: RosterPlayer[] | null;
  season_stats?: { season: string; played: number; won: number; drawn: number; lost: number }[] | null;
};

export type Squad = { squad_id: string; club_id?: string; name?: string; size?: number };

export type AuditEntry = {
  audit_id: string;
  action: string;
  player_id: string;
  from_squad_id?: string | null;
  to_squad_id?: string | null;
  effective_date?: string;
  state?: string;
  who?: string;
  when?: string;
  why?: string;
};

export type History = {
  player_id: string;
  league_id?: string;
  current_squad_id?: string | null;
  parent_squad_id?: string | null;
  history: AuditEntry[];
};

export type Variant = { variant_id: string; label?: string | null; price_minor: number; stock?: number | null };

export type Product = {
  product_id: string;
  name: string;
  description?: string | null;
  image_url?: string | null;
  variants: Variant[];
};

export type CheckoutResponse = {
  order_id: string;
  status: string;
  currency: string;
  subtotal_minor: number;
  discount_minor: number;
  total_minor: number;
  receipt: { payload: { paid_at?: string }; signature: string; pdf_base64: string };
};

export function teamId(t: TeamRef | string): string {
  return typeof t === "string" ? t : t.team_id;
}
export function teamName(t: TeamRef | string, names?: Record<string, string>): string {
  if (typeof t === "string") return names?.[t] ?? t;
  return t.name ?? names?.[t.team_id] ?? t.team_id;
}
