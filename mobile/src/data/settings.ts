// Non-secret settings stored in the local SQLite kv table: server URL, device id, session JSON.
// The JWT itself lives only in expo-secure-store (Android Keystore) — see session.ts.
import * as Crypto from "expo-crypto";
import { kvGet, kvSet } from "./db";

export const DEFAULT_SERVER_URL = "http://10.0.2.2:8080";

export function getServerUrl(): string {
  return kvGet("server_url") ?? DEFAULT_SERVER_URL;
}

export { normaliseServerUrl } from "../core/url";

export function setServerUrl(url: string): void {
  kvSet("server_url", url);
}

export function getDeviceId(): string {
  let id = kvGet("device_id");
  if (!id) {
    id = "dev-" + Crypto.randomUUID();
    kvSet("device_id", id);
  }
  return id;
}
