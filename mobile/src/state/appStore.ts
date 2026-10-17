// Global app state (Zustand): session, connectivity, queue size, theme, selected league, toasts.
// Server data is NOT kept here; it lives in SQLite.
import { create } from "zustand";

export type Role = "super_admin" | "league_organizer" | "club_manager" | "player" | "viewer";

export type SessionUser = {
  user_id: string;
  email: string;
  display_name?: string | null;
  role: Role;
  tenant_id?: string | null;
  league_ids?: string[] | null;
  club_id?: string | null;
  player_id?: string | null;
};

export type Tenant = {
  tenant_id: string;
  name: string;
  logo_url?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
};

export type Session = { user: SessionUser; tenant: Tenant | null; expires_at?: string | null };

export type NetState = "online" | "offline";

export type Toast = { id: number; text: string; tone: "success" | "error" | "info" };

type AppState = {
  session: Session | null;
  netState: NetState;
  syncing: boolean;
  pendingCount: number;
  rejectedCount: number;
  dataVersion: number;
  selectedLeagueId: string | null;
  toast: Toast | null;
  setSession: (s: Session | null) => void;
  setNetState: (n: NetState) => void;
  setSyncing: (b: boolean) => void;
  setCounts: (pending: number, rejected: number) => void;
  bumpDataVersion: () => void;
  setSelectedLeagueId: (id: string | null) => void;
  showToast: (text: string, tone?: Toast["tone"]) => void;
  hideToast: () => void;
};

let toastSeq = 0;

export const useAppStore = create<AppState>((set) => ({
  session: null,
  netState: "online",
  syncing: false,
  pendingCount: 0,
  rejectedCount: 0,
  dataVersion: 0,
  selectedLeagueId: null,
  toast: null,
  setSession: (session) => set({ session }),
  setNetState: (netState) => set({ netState }),
  setSyncing: (syncing) => set({ syncing }),
  setCounts: (pendingCount, rejectedCount) => set({ pendingCount, rejectedCount }),
  bumpDataVersion: () => set((s) => ({ dataVersion: s.dataVersion + 1 })),
  setSelectedLeagueId: (selectedLeagueId) => set({ selectedLeagueId }),
  showToast: (text, tone = "info") => set({ toast: { id: ++toastSeq, text, tone } }),
  hideToast: () => set({ toast: null }),
}));

export const toast = (text: string, tone: Toast["tone"] = "info") => useAppStore.getState().showToast(text, tone);
