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

## Checks

- JSON files parse successfully.
- All referenced Pi models exist in `~/.pi/agent/models-store.json`.
- `profiles/agents/kairos.md` exists and has `name: kairos` frontmatter.
- `gentle-ai doctor` remains healthy.

## Next step

Let Ricardo decide when to create the first commit and whether to add a remote.
