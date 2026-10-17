# UI and HCI Design

Part of [the mobile architecture doc set](index.md). Maps to spec §8.6 (judges score 10 pts here — see [00-instructions-scope-and-assumptions.md](00-instructions-scope-and-assumptions.md)).

## Design system (NativeWind)

NativeWind lets React Native components use Tailwind CSS class names (`className="p-4 bg-primary"`). It ships **no ready-made components**, so the app builds its own small set in `src/ui/components/` and every screen uses only those. That is what keeps HCI area 2 (consistency) intact.

- **Tokens live in one place**, `tailwind.config.js`: colours (`primary`, `on-primary`, `secondary`, `surface`, `on-surface`, `muted`, `success`, `warning`, `danger`), font sizes, and spacing 4, 8, 12, 16, 24 dp (Tailwind `1, 2, 3, 4, 6`). Screen padding `p-4` (16 dp). No hex colours or pixel values in screen files.
- **Tenant theme:** `primary` and `secondary` are defined in `tailwind.config.js` as CSS variables (`rgb(var(--color-primary) / <alpha-value>)`). `TenantThemeProvider` (in `src/ui/theme/tenantTheme.ts`) wraps the app in a `View` with NativeWind's `vars({ "--color-primary": "...", ... })` built from tenant `primary_color` / `secondary_color` (hex → `"r g b"`), and falls back to default colours. Super-admin (no tenant) gets the default. Tenant logo + name in the header of every top-level screen.
- **Contrast check:** if tenant colour vs on-colour contrast < 4.5:1, set `--color-on-primary` to black or white, whichever passes.
- **Typography:** body ≥ 16 sp (`text-base`); score text `text-5xl font-bold`. React Native `Text` follows the phone's font-size setting by default; support font scale up to 1.3 without clipping (`maxFontSizeMultiplier={1.3}` on dense rows like the standings table).
- **Components to build** (all in `src/ui/components/`): `PrimaryButton` (filled), `SecondaryButton` (outlined), `StatusChip`, `SectionHeader`, `ConnectivityBanner`, `LoadingState`, `EmptyState`, `ErrorState`, `ConfirmDialog` (RN `Modal`), `BottomSheet` (RN `Modal`, slide animation), `Toast` (reads `toastStore`), `MoneyText`, `PendingBadge`, `TextField` (label + error text).
- **Every pressable** (`Pressable`) has `min-h-12` (48 dp), `accessibilityRole="button"` and an `accessibilityLabel`. Icon-only buttons are not allowed without a label.
- Light theme required; dark theme optional (skip if time is short — see cut order in [15-build-order.md](15-build-order.md)).

## Mapping to the five judged areas

| Area | Design decisions |
| --- | --- |
| 1. Navigation & ease of use | 5-item bottom bar with labels; league selector shared by Fixtures and Standings; task A = 2 taps (Standings → match row); task B = Store → product → size → Add to cart → Cart → Pay (6 taps); hardware Back always pops; no screen without a back path; Login → Home uses `router.replace` so Login is never on the stack |
| 2. Visual consistency & hierarchy | Only the shared components above are used; colours/spacing only from `tailwind.config.js` tokens; score is the biggest text on Match detail; the Buy/Pay button is the only filled button on its screen; tenant colours/logo applied |
| 3. Feedback & error handling | `LoadingState` with text on every load; toasts on success ("Added to cart", "<event label> recorded"); plain-language errors ([10-error-handling.md](10-error-handling.md)), never raw codes; `ConnectivityBanner` always visible below the header; confirm dialogs on: Pay, Release, Transfer, Loan, End match, Correct event, Logout |
| 4. Readability & accessibility | `min-h-12` (48 dp) touch targets; every icon has an `accessibilityLabel`; status = icon + text (e.g. green dot + "Online", clock + "Pending sync", check + "Clinched", cross + "Eliminated"); standings status as text chip, not row colour |
| 5. Right screen for the right role | [04-navigation.md](04-navigation.md) role matrix; every list has an `EmptyState` with a sentence ("No matches yet", "Your cart is empty", "No pending changes"); lists use `FlatList`, other screens `ScrollView`; Standings table scrolls horizontally (`ScrollView horizontal`) with a fixed team column; `app.json` `orientation: "default"` so rotation works; tested at 360×640 dp portrait and landscape; state survives rotation |

## ConnectivityBanner spec

| State | Icon (MaterialCommunityIcons) | Text | Colour (secondary cue only) |
| --- | --- | --- | --- |
| Online, queue empty | `cloud-check-outline` | "Online" | green background |
| Online, syncing | `ActivityIndicator` spinner | "Syncing 2 changes..." | blue background |
| Offline | `cloud-off-outline` | "Offline · 2 pending" (or "Offline") | grey background |
| Online, some rejected | `alert-outline` | "1 change not applied · View" | amber background |

Tapping the banner opens Sync status. Height 32 dp; the text has `accessibilityLiveRegion="polite"` so TalkBack announces changes. State comes from the Zustand `appStore` (`netState`, `pendingCount`), which `connectivityMonitor` updates (see [03-components-and-responsibilities.md](03-components-and-responsibilities.md) and [08-offline-sync-and-tolerance.md](08-offline-sync-and-tolerance.md)).

## Screen content checklist (spec §8.2)

| Screen | Must show | Done when |
| --- | --- | --- |
| Login | Email, password (show/hide toggle), Sign in, server address link, demo-accounts hint in development builds (`__DEV__`) | Role-aware Home opens |
| Fixtures | League selector, list rows: teams, time (local), venue, `StatusChip` | Tap opens Match detail |
| Match detail | Big score, status, Live label, timeline (pending + corrected labels), pinned product cards, "Enter score" for allowed roles | Score updates without manual refresh |
| Standings | Table: rank, team, P W D L, diff, pts, status chip; legend explaining chips | Qualification status visible |
| Club profile | Logo, name, venue name + coordinates + "Open in Maps" (`Linking.openURL("geo:lat,lng?q=lat,lng(name)")`), socials, staff, roster grouped by position, season stats | |
| Store | Product grid/list, variant picker with stock ("Only 1 left", "Sold out" disabled), cart, discount, mock payment, receipt | Receipt opens and downloads |
| Roster management | Player list, Transfer / Loan / Release forms, history link | Works online and offline |
| Scoring entry | Config-driven buttons per team, start/end, correction | Works online and offline |
| Sync status | Pending list (summary, queued time), last results with reasons, "Sync now" | Queue clears after sync |

Route-to-screen mapping and role visibility are in [04-navigation.md](04-navigation.md). Flow-level detail (checkout, receipt, scoring, roster) is in [09-key-flows.md](09-key-flows.md).
