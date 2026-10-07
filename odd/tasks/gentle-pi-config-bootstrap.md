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
- [x] T9 — Rebalance both profiles using current benchmark evidence and agent purpose.
- [x] T10 — Replace unavailable Codex Spark worker routing with the verified Codex Luna fallback while preserving the active profile.

## Checks

- JSON files parse successfully.
- Every profile in `profiles/profiles.json` resolves against `~/.pi/agent/models-store.json`.
- Every profile key belongs to Gentle Pi's official inventory from `lib/sdd-preflight.ts` and `assets/agents/*.md`.
- Official SDD agents are installed through `/gentle:install-sdd`.
- `sdd-opencode-go` keeps expensive reasoning models on infrequent analysis phases and uses cheaper models for frequent execution.
- `sdd-opencode` uses OpenAI GPT-6.1 Sol for high-value reasoning/review and GPT-5.3 Codex Spark for implementation.
- `profiles/agents/kairos.md` exists and has `name: kairos` frontmatter.
- `gentle-ai doctor` remains healthy.
- `apply-active-profile.mjs --dry-run` reports no unexpected changes when the active profile matches the current Pi state.

## Evidence

- `scripts/verify-pi-gentle --strict-materialized` → 13 models across 2 profiles; official profile keys, runtime stores, and assets all pass.
- `scripts/sync-pi-gentle --no-gentle-sync` → official names materialized end-to-end with active profile `sdd-opencode-go`.
- `node scripts/apply-active-profile.mjs --print-roles` → direct official SDD, delegation, Judgment Day, review, and orchestrator keys.
- `/gentle:install-sdd` → installed the official SDD agent assets and support files.
- `sdd-opencode-go`: `sdd-apply` → DeepSeek V4 Pro and `sdd-onboard` → MiMo V2.6 Pro.
- `sdd-opencode`: analysis/review → GPT-6.1 Sol; implementation/fix → GPT-5.6 Luna; mechanical/bootstrap phases stay on lower-cost models.
- `gentle-ai doctor` → 9 passed, 0 failed, 0 warnings.
- Local model inventory confirms `openai-codex/gpt-5.6-luna` is materialized and is the current session model; Codex Spark was removed from worker/fix routing.
- `node scripts/verify-models.mjs /home/unseen/gentle-pi-config /home/unseen/.pi/agent --strict-materialized` → passed; all 11 routed agents and all 13 profile models resolve.
- `node scripts/apply-active-profile.mjs --dry-run` → unchanged after materialization.
- `gentle-ai-worker` retry → completed successfully with the Luna fallback; previous Spark routing failure reproduced no longer.

## Next step

Commit the source profile/task evidence if Ricardo wants the configuration change versioned. Restart or reload Pi before relying on long-lived processes; future worker launches should use Luna. Let Ricardo decide later whether to switch profiles or add a remote.
