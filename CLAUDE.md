# Project guide

NaSCon '26 App Dev, Part I: multi-sport league & club platform (backend + mobile), graded by Python scripts against a binding API contract.

## Spec
The full problem statement is split by topic in `Docs/spec/`. **Start at `Docs/spec/index.md`**, open only the file(s) relevant to the task, and treat them as the source of truth. If something isn't in the spec, flag it rather than inventing it. The original unsplit document is `Docs/NaSCon 26 App Dev Part 1-1.md` (fallback only).

## Non-negotiables
- `DAY1_SALT` comes from the environment only; never hard-code or commit it.
- No branching on sport or event names in domain logic (−8 penalty).
- No third-party fixture-generation libraries; no managed BaaS.
- Scores and standings are always rebuilt from the append-only event log.

## Response Guidelines 
- Explain concepts simply and assume the developer is a junior. Avoid unexplained framework-specific or advanced terminology.
- Name tools, services, extensions, and infrastructure explicitly. State where each comes from and what it does.
- Clearly identify all manual steps, including configuration, database changes, dashboard settings, environment variables, CLI commands, and deployment steps.
- End every response with a `Files Edited` and `Required Actions` section listing every file modified and any steps/actions required by the user.