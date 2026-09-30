# Gentle Pi Config Bootstrap

## Objective

Create a small reproducible repository for Ricardo's Gentle Shell / Pi overlays.

## Scope

- Store the active Pi/Gentle model profiles as versionable JSON.
- Store a generated Pi `kairos` agent derived from the OpenCode Kairos prompt.
- Provide deterministic scripts to sync and verify the overlays.
- Avoid secrets, sessions, auth files, and unrelated Pi settings.

## Tasks

- [x] T1 — Create repository structure.
- [x] T2 — Capture current `sdd-opencode` overlays.
- [x] T3 — Add sync and verify scripts.
- [x] T4 — Initialize git and review status.
- [x] T5 — Generate and install the Pi `kairos` agent.
- [x] T6 — Add `sdd-opencode-go` profile (opencode-go only) with benchmark-informed routing.
- [x] T7 — Move `models.json` / `subagents.json` from static files to per-profile materialization.
- [x] T8 — Align routing with Gentle Pi's official agent inventory and install official SDD assets.

## Checks

- JSON files parse successfully.
- Every profile in `profiles/profiles.json` resolves against `~/.pi/agent/models-store.json`.
- Every profile key belongs to Gentle Pi's official inventory from `lib/sdd-preflight.ts` and `assets/agents/*.md`.
- Official SDD agents are installed through `/gentle:install-sdd`.
- `profiles/agents/kairos.md` exists and has `name: kairos` frontmatter.
- `gentle-ai doctor` remains healthy.
- `apply-active-profile.mjs --dry-run` reports no unexpected changes when the active profile matches the current Pi state.

## Evidence

- `scripts/verify-pi-gentle --strict-materialized` → 13 models across 2 profiles; official profile keys, runtime stores, and assets all pass.
- `scripts/sync-pi-gentle --no-gentle-sync` → official names materialized end-to-end with active profile `sdd-opencode-go`.
- `node scripts/apply-active-profile.mjs --print-roles` → direct official SDD, delegation, Judgment Day, review, and orchestrator keys.
- `/gentle:install-sdd` → installed the official SDD agent assets and support files.
- `gentle-ai doctor` → 9 passed, 0 failed, 0 warnings.

## Next step

Let Ricardo decide whether to switch back to `sdd-opencode` (`scripts/set-active-profile sdd-opencode`) and whether to add a remote for this repository.
