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

## Checks

- JSON files parse successfully.
- Every profile in `profiles/profiles.json` resolves against `~/.pi/agent/models-store.json`.
- `profiles/agents/kairos.md` exists and has `name: kairos` frontmatter.
- `gentle-ai doctor` remains healthy.
- `apply-active-profile.mjs --dry-run` reports no unexpected changes when the active profile matches the current Pi state.

## Evidence

- `scripts/verify-pi-gentle` → 13 models across 2 profiles, all ok.
- `scripts/sync-pi-gentle --no-gentle-sync` → active profile `sdd-opencode` unchanged; end-to-end materialization passes.
- `scripts/apply-active-profile.mjs --dry-run` → `unchanged` on all four targets when `active` is `sdd-opencode`.
- `gentle-ai doctor` → 9 passed, 0 failed, 0 warnings.

## Next step

Let Ricardo decide when to switch to `sdd-opencode-go` (`scripts/set-active-profile sdd-opencode-go`) and whether to add a remote for this repository.
