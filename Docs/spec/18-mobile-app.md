# 18 — Mobile Application: Requirements, Demo Accounts, Offline Desk Check, UI/HCI Judging

Scope: everything about the mobile app (Section 8). Server-side offline logic is in [16-offline-sync.md](16-offline-sync.md); store/receipt API in [14-store-checkout.md](14-store-checkout.md); RBAC in [15-rbac-security.md](15-rbac-security.md). Score weights: Offline 4 pts (part), UI/HCI 10 pts ([19-scoring-rubric-penalties.md](19-scoring-rubric-penalties.md)).

## 8.1 Platform and delivery
- **Android (recommended):** provide `mobile/release/app-release.apk`, installable on Android 10 (API 29) or newer.
- **iOS teams:** bring their own device or simulator with the app already installed; the judging slot is the same.
- The app talks to the backend on the **team laptop** (docker compose running). The **server address must be changeable inside the app** (settings screen or build config): emulator uses `10.0.2.2:8080`; a phone uses the laptop's LAN IP.
- **Secure token storage is mandatory** (Android Keystore / iOS Keychain).
- One platform suffices for 100% mobile credit.

## 8.2 Required screens

| Screen | Must show |
| --- | --- |
| Login | Email + password; role-aware home after login. |
| Fixtures | List of matches with status and time; tap to open a match. |
| Match detail | Live score (updates in real time), event timeline, pinned product showcase. |
| Standings | Points table for a league with qualification status. |
| Club profile | Club info, roster, staff, home venue. |
| Store | Catalogue, variant picker, cart, checkout with the mock gateway, receipt view/download. |
| Roster management | For Club Manager: add / transfer / loan / release a player. |
| Scoring entry | For League Organizer: append a score event and a compensating event. |
| Sync status | Always-visible online / offline / syncing indicator and the pending-action queue. |

## 8.3 Demo accounts
Must exist after **every startup and every `/reset`**. Also list in `README.md`.

| Role | Email | Password |
| --- | --- | --- |
| Platform Super-Admin | `admin@nascon.test` | `Nascon@26` |
| League Organizer (owns `league-alpha-1`) | `organizer@nascon.test` | `Nascon@26` |
| Club Manager (owns `club-alpha-1`) | `manager@nascon.test` | `Nascon@26` |
| Player (`player-alpha-1`) | `player@nascon.test` | `Nascon@26` |
| General Viewer | `viewer@nascon.test` | `Nascon@26` |

## 8.4 Offline tolerance (NFR-4) — what the desk check does
1. With the backend reachable, the judge opens **Fixtures, Standings, and a Club profile**. The app must cache them in a local database (SQLite / Room / Hive).
2. Judge switches the phone to airplane mode. Cached screens must still open and an **"Offline" indicator** must show.
3. While offline the judge performs **one scoring action (as Organizer)** and **one roster action (as Manager)**. Each must be stored in a **persistent local queue**, appear as **"pending"** in the UI, and use the **action format of** [16-offline-sync.md](16-offline-sync.md).
4. Judge **force-closes and reopens** the app while still offline. Pending actions must still be there.
5. Judge turns the network on. The app must **sync automatically** (or via an obvious Sync button), show **per-action results** (applied / rejected + reason), and **clear the queue**. Rejected actions must be explained in **plain language**.

## 8.5 Judging procedure
- From **15:15 PKT** judges visit each team at its venue desk. Each team gets one fixed **10-minute slot**. Team must have the backend running and the app installed.
- All judges use the same three tasks (below). Judges do not help the team during the slot.
- A team not ready at its slot is moved to the end of the queue once; if still not ready, the desk-check parts (offline and UI/HCI) score **0**.

## 8.6 What the UI/HCI judges look at
Same three tasks on every team's app:
- **(A)** find a league's standings and open one match;
- **(B)** buy a merchandise item with the mock payment and open the receipt;
- **(C)** as Club Manager, perform a roster action — then repeat one action in airplane mode and sync.

Five judged areas:

| Area | What we check |
| --- | --- |
| 1. Navigation & ease of use | A new user can find Fixtures, Standings, Store, and Profile without help. Common tasks take few taps. Back/undo always works. No dead ends. |
| 2. Visual consistency & hierarchy | Same colors, fonts, spacing, button styles on every screen. Most important things (score, Buy button) stand out. The **tenant's logo and colors are applied**. |
| 3. Feedback & error handling | App always tells the user what is happening: loading indicators, success messages, clear plain-language errors (never raw codes like "Error 500"), visible Online / Offline / Syncing status, confirmation before risky actions. |
| 4. Readability & accessibility | Text large enough, good contrast, tap targets comfortably big (~**48 dp**), icons have labels or descriptions, meaning never shown by color alone. |
| 5. Right screen for the right role | Each role sees only what it can use. Empty lists show a helpful message ("No matches yet"). Nothing breaks or overflows on a small phone (**360×640 dp**) or after rotating. |

Related product requirement: real-time updates for live scores/status/pinned product (WebSocket/SSE layer) — see [02-functional-and-nonfunctional-requirements.md](02-functional-and-nonfunctional-requirements.md).
