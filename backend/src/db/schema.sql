-- NaSCon '26 Part I schema. Hybrid design: keys and relations are columns; configs, payloads and
-- stored responses are JSONB. Created idempotently at startup.

CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value JSONB NOT NULL);

-- Tenancy / RBAC scenario
CREATE TABLE IF NOT EXISTS tenants (
  tenant_id TEXT PRIMARY KEY, name TEXT NOT NULL, logo_url TEXT, primary_color TEXT, secondary_color TEXT);
CREATE TABLE IF NOT EXISTS clubs (
  club_id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants, name TEXT NOT NULL, profile JSONB NOT NULL DEFAULT '{}');
CREATE TABLE IF NOT EXISTS scenario_leagues (
  league_id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants, name TEXT NOT NULL, sport_id TEXT NOT NULL, season TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS scenario_players (
  player_id TEXT PRIMARY KEY, club_id TEXT NOT NULL REFERENCES clubs, tenant_id TEXT NOT NULL REFERENCES tenants, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, display_name TEXT NOT NULL,
  role TEXT NOT NULL, tenant_id TEXT, league_ids JSONB NOT NULL DEFAULT '[]', club_id TEXT, player_id TEXT);

-- Sports are pure data (same schema as POST /audit/v1/sports)
CREATE TABLE IF NOT EXISTS sports (
  sport_id TEXT PRIMARY KEY, config JSONB NOT NULL, seeded BOOLEAN NOT NULL DEFAULT false, created_seq BIGSERIAL);

-- Leagues and event-sourced matches
CREATE TABLE IF NOT EXISTS leagues (
  league_id TEXT PRIMARY KEY, sport_id TEXT NOT NULL REFERENCES sports, config JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS matches (
  match_id TEXT PRIMARY KEY, sport_id TEXT NOT NULL REFERENCES sports, league_id TEXT,
  home TEXT NOT NULL, away TEXT NOT NULL, info JSONB NOT NULL DEFAULT '{}', created_seq BIGSERIAL);
CREATE TABLE IF NOT EXISTS events (
  match_id TEXT NOT NULL REFERENCES matches, sequence INT NOT NULL, event_id TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL, payload JSONB NOT NULL, body_hash TEXT NOT NULL, signature TEXT NOT NULL,
  response JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, sequence));

-- Roster
CREATE TABLE IF NOT EXISTS roster_leagues (league_id TEXT PRIMARY KEY, config JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS squads (
  squad_id TEXT PRIMARY KEY, league_id TEXT NOT NULL, club_id TEXT, tenant_id TEXT NOT NULL, name TEXT);
CREATE TABLE IF NOT EXISTS players (
  player_id TEXT PRIMARY KEY, league_id TEXT NOT NULL, name TEXT, position TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS registrations (
  reg_seq BIGSERIAL PRIMARY KEY, player_id TEXT NOT NULL, league_id TEXT NOT NULL, data JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS audit_entries (
  audit_seq BIGSERIAL PRIMARY KEY, player_id TEXT NOT NULL, entry JSONB NOT NULL, loan_ref TEXT UNIQUE);
CREATE TABLE IF NOT EXISTS roster_requests (
  request_id TEXT PRIMARY KEY, league_id TEXT NOT NULL, body_hash TEXT NOT NULL, response JSONB NOT NULL);

-- Store
CREATE TABLE IF NOT EXISTS products (
  product_id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL, info JSONB NOT NULL DEFAULT '{}');
CREATE TABLE IF NOT EXISTS variants (
  variant_id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products, label TEXT NOT NULL,
  price_minor INT NOT NULL, stock INT NOT NULL CHECK (stock >= 0), reserved INT NOT NULL DEFAULT 0 CHECK (reserved >= 0));
CREATE TABLE IF NOT EXISTS discount_codes (code TEXT PRIMARY KEY, percent INT NOT NULL);
CREATE TABLE IF NOT EXISTS orders (
  order_id TEXT PRIMARY KEY, body_hash TEXT NOT NULL, status TEXT NOT NULL, response JSONB,
  receipt_pdf BYTEA, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE SEQUENCE IF NOT EXISTS payment_seq;

-- Offline sync
CREATE TABLE IF NOT EXISTS sync_actions (
  device_id TEXT NOT NULL, action_id TEXT NOT NULL, result JSONB NOT NULL, PRIMARY KEY (device_id, action_id));
