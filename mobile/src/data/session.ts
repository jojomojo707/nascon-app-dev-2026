// Session storage: JWT in expo-secure-store (encrypted with an Android Keystore key),
// user/tenant JSON in the local kv table. The token is never logged.
import * as SecureStore from "expo-secure-store";
import { clearUserData, kvDelete, kvGet, kvSet } from "./db";
import { Session, useAppStore } from "../state/appStore";

const TOKEN_KEY = "nascon_jwt";
let tokenCache: string | null = null;

export async function loadSession(): Promise<Session | null> {
  try {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    const raw = kvGet("session");
    if (!token || !raw) return null;
    tokenCache = token;
    const session = JSON.parse(raw) as Session;
    useAppStore.getState().setSession(session);
    return session;
  } catch {
    // Keystore key invalidated (device security change) -> treat as signed out.
    await clearSession();
    return null;
  }
}

export async function saveSession(token: string, session: Session): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  tokenCache = token;
  kvSet("session", JSON.stringify(session));
  useAppStore.getState().setSession(session);
}

export function getToken(): string | null {
  return tokenCache;
}

export async function clearSession(): Promise<void> {
  tokenCache = null;
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // nothing stored
  }
  kvDelete("session");
  clearUserData();
  useAppStore.getState().setSession(null);
}
