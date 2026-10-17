// HTTP client (axios) with the interceptor chain from mobile/architecture/07:
// base URL from settings on every request, rate-limit gate, bearer auth, 429/401 handling,
// and conversion of every failure into an AppError. Repositories never throw to the UI.
import axios, { AxiosError, AxiosRequestConfig } from "axios";
import { router } from "expo-router";
import { AppError, appErrorFromResponse } from "../core/errors";
import { getServerUrl } from "./settings";
import { clearSession, getToken } from "./session";
import { toast } from "../state/appStore";

export const routes = {
  health: "/health",
  login: "/api/v1/auth/login",
  leagues: "/api/v1/leagues",
  fixtures: (leagueId: string) => `/api/v1/leagues/${encodeURIComponent(leagueId)}/fixtures`,
  squads: (leagueId: string) => `/api/v1/leagues/${encodeURIComponent(leagueId)}/squads`,
  standings: (leagueId: string) => `/api/v1/standings/${encodeURIComponent(leagueId)}`,
  sport: (sportId: string) => `/api/v1/sports/${encodeURIComponent(sportId)}`,
  score: (matchId: string) => `/api/v1/matches/${encodeURIComponent(matchId)}/score`,
  pinned: (matchId: string) => `/api/v1/matches/${encodeURIComponent(matchId)}/pinned-products`,
  events: "/api/v1/events",
  clubs: "/api/v1/clubs",
  club: (clubId: string) => `/api/v1/clubs/${encodeURIComponent(clubId)}`,
  rosterTransfer: "/api/v1/roster/transfer",
  rosterHistory: (playerId: string) => `/api/v1/roster/history/${encodeURIComponent(playerId)}`,
  products: "/api/v1/products",
  inventory: (variantId: string) => `/api/v1/inventory/${encodeURIComponent(variantId)}`,
  checkout: "/api/v1/checkout",
  offlineSync: "/api/v1/offline-sync",
  demoSeed: "/api/v1/demo/seed",
};

export type ApiResult<T> = { ok: true; data: T; status: number } | { ok: false; error: AppError };

let blockedUntil = 0;

const client = axios.create({ timeout: 10000, headers: { "Content-Type": "application/json" } });

client.interceptors.request.use((config) => {
  config.baseURL = getServerUrl();
  const url = config.url ?? "";
  const token = getToken();
  if (token && url.startsWith("/api/v1/") && url !== routes.login) {
    config.headers.set("Authorization", `Bearer ${token}`);
  }
  return config;
});

function toAppError(err: unknown): AppError {
  const e = err as AxiosError;
  if (!e.response) {
    return e.code === "ECONNABORTED" || e.code === "ETIMEDOUT" ? { kind: "timeout" } : { kind: "offline" };
  }
  const retry = (e.response.headers?.["retry-after"] as string | undefined) ?? null;
  return appErrorFromResponse(e.response.status, e.response.data, retry);
}

/** Single entry point for every request. Returns ApiResult; never throws. */
export async function request<T>(config: AxiosRequestConfig): Promise<ApiResult<T>> {
  const now = Date.now();
  if (blockedUntil > now) {
    return { ok: false, error: { kind: "rateLimited", retryAfterSec: Math.ceil((blockedUntil - now) / 1000) } };
  }
  try {
    const res = await client.request<T>(config);
    return { ok: true, data: res.data, status: res.status };
  } catch (err) {
    const error = toAppError(err);
    if (error.kind === "rateLimited") blockedUntil = Date.now() + error.retryAfterSec * 1000;
    if (error.kind === "unauthenticated" && config.url !== routes.login) {
      await clearSession();
      toast("Your session expired. Please sign in again.", "error");
      router.replace("/login");
    }
    return { ok: false, error };
  }
}

export const apiGet = <T>(url: string) => request<T>({ method: "GET", url });
export const apiPost = <T>(url: string, data?: unknown) => request<T>({ method: "POST", url, data: data ?? {} });

/** Health check against an explicit base URL (Settings "Test connection" and the connectivity monitor). */
export async function pingHealth(baseUrl?: string): Promise<boolean> {
  try {
    const res = await axios.get((baseUrl ?? getServerUrl()) + routes.health, { timeout: 3000 });
    return res.status === 200;
  } catch {
    return false;
  }
}

/** Lists may come back as a bare array or wrapped ({items|data|...}); accept both. */
export function asArray<T>(data: unknown, ...keys: string[]): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object") {
    for (const k of [...keys, "items", "data", "results"]) {
      const v = (data as Record<string, unknown>)[k];
      if (Array.isArray(v)) return v as T[];
    }
  }
  return [];
}
