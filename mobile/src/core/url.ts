/** Accepts "192.168.1.5:8080" or "http://host:port"; returns a normalised URL or null. */
export function normaliseServerUrl(input: string): string | null {
  let s = input.trim().replace(/\/+$/, "");
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = "http://" + s;
  if (!/^https?:\/\/[A-Za-z0-9.\-]+(:\d{1,5})?$/.test(s)) return null;
  return s;
}
