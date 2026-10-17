# Security (NFR-5, OWASP Mobile Top 10 relevant items)

Part of [the mobile architecture doc set](index.md).

| Risk | Control |
| --- | --- |
| Insecure credential storage | JWT stored with `expo-secure-store` (encrypted with an Android Keystore key); password never stored (see [06-data-persistence.md](06-data-persistence.md) §Token storage) |
| Secrets in APK | No salt, no API keys, nothing secret in `app.json` or `EXPO_PUBLIC_*` env vars (those are baked into the JS bundle and readable by anyone). `DAY1_SALT` exists only on the backend (non-negotiable, see [index.md](index.md)) |
| Logging leaks | No token/password in `console.log`; request logging only when `__DEV__` is true, with the `Authorization` header redacted |
| Authorization bypass | UI hiding is cosmetic; every write goes to server which enforces RBAC; 403 handled (see role matrix in [04-navigation.md](04-navigation.md)) |
| Session handling | 401 → wipe session, go to Login; logout clears token, session, cart, caches of other tenants |
| Input validation | Client-side: required fields, date ordering, id regex, email format, length limits (reason ≤ 200 chars); server stays authoritative |
| Rate limiting | Client honours 429 `Retry-After`; refresh debounced (see [07-networking-and-api.md](07-networking-and-api.md) §axios interceptor chain) |
| Insecure transport | Cleartext HTTP is required to reach the LAN backend (assumption A11 in [00-instructions-scope-and-assumptions.md](00-instructions-scope-and-assumptions.md)). Allowed via `expo-build-properties` `android.usesCleartextTraffic: true`; documented as a demo-environment trade-off. If the backend adds TLS, switch the URL to https and remove the flag |
| Exported components | Only the main activity is exported (Expo default). Sharing receipts goes through `expo-sharing`, which uses a non-exported FileProvider with temporary read grants |
| Backups | `app.json` → `android.allowBackup: false` so cached data and session files are not backed up |
| Development tools in release | Release APK is built with `assembleRelease`: no dev menu, no Metro connection, JS bundle embedded |
| Screenshots of receipt | Not restricted (judges need to see it) |

Build-level controls (cleartext flag, `allowBackup`) are set in [14-build-and-delivery.md](14-build-and-delivery.md).
