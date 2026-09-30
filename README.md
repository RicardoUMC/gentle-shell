# Gentle Pi Config

Personal, reproducible Gentle Shell / Pi overlays for Ricardo's machines.

This repository does **not** install Pi itself and does **not** own secrets, auth files, sessions, or the full `~/.pi` directory. It only stores the small configuration overlays that should survive `gentle-ai sync --agent pi` and machine rebuilds.

## What this repo manages

- `profiles/profiles.json` → translated by `apply-active-profile.mjs` and written to Pi runtime as:
  - `~/.pi/gentle-ai/profiles.json` (translated profiles envelope, **Pi-native agent keys only**)
  - `~/.pi/gentle-ai/models.json` (translated active profile, **Pi-native agent keys only**)
  - `~/.pi/agent/subagents.json` (`model_profiles` keyed by **Pi agent name**, never by phase key)
  - `~/.pi/agent/settings.json` (only the three `defaultProvider`/`defaultModel`/`defaultThinkingLevel` keys)
  - `~/.pi/agent/agents/<name>.md` frontmatter (`model:` / `thinking:`) for mapped agents that already exist
- `profiles/agents/kairos.md` → copied to `~/.pi/agent/agents/kairos.md`

## Role translation (phase key → Pi agent)

Profiles are written with OpenCode/SDD **phase** keys (`sdd-init`, `sdd-explore`, `sdd-apply`, ...). That is the schema OpenCode consumes and it is intentional. Pi has no agents with those names, so copying the keys verbatim into `subagents.json` matched nothing and every child silently inherited the orchestrator model. The same risk applies to `~/.pi/gentle-ai/profiles.json` and `~/.pi/gentle-ai/models.json`: Pi's `/gentle:profiles` reads those stores and applies whichever keys it finds to the installed agents. If those stores contained raw `sdd-*` phase keys, applying a profile through the UI would clear every real agent's routing.

`apply-active-profile.mjs` therefore translates every source profile into Pi-native runtime profiles before writing anything to `~/.pi`. Phase keys stay in the repo-side `profiles/profiles.json`; they never reach the Pi runtime stores. The result is that `/gentle:profiles` sees only keys that actually exist as installed Pi agents (`gentle-ai-explore`, `kairos`, ...) plus the reserved `orchestrator` key, so applying a profile through the UI is safe.

`apply-active-profile.mjs` uses one deterministic table (`ROLE_TRANSLATION`) and performs the translation in memory; it never rewrites `profiles/profiles.json`:

| Source phase key | Pi agent | Why |
| --- | --- | --- |
| `sdd-explore` | `gentle-ai-explore` | Read-only exploration/mapping is Pi's scout role. |
| `sdd-apply` | `gentle-ai-worker` | Bounded scoped implementation is Pi's writer role. |
| `sdd-verify` | `gentle-ai-verify` | Command-running verification is Pi's verifier role. |
| `sdd-verify` | `jd-judge-a`, `jd-judge-b` | Judgment-Day judges review the same contract the verifier checks, so they share its model. |
| `sdd-verify` | `review-risk`, `review-resilience`, `review-readability`, `review-reliability` | Review lenses are verification-shaped work; one model choice covers them. |
| `sdd-remediate`, else `sdd-apply` | `jd-fix-agent` | Fixes are writer-shaped. Prefer the dedicated remediate phase; fall back to `sdd-apply` when a profile has none. |
| `orchestrator` | `kairos` | `kairos` is the dedicated coordinator agent, so it receives the profile's orchestrator model (and thinking level). |

Rules that table follows:

- Phase keys with no Pi counterpart (`sdd-init`, `sdd-onboard`, `sdd-research`, `sdd-proposal`, `sdd-spec`, `sdd-design`, `sdd-tasks`, `sdd-status`, `sdd-archive`) are **never** materialized into Pi runtime files. They stay OpenCode-side in the repo's `profiles/profiles.json`; the runtime copies (`~/.pi/gentle-ai/profiles.json` and `~/.pi/gentle-ai/models.json`) contain only translated Pi-native keys.
- Each Pi agent appears at most once; sources are tried in the listed order and the first present one wins.
- Model and thinking semantics are unchanged: `model` → `model_profiles[agent].model` and `model:` frontmatter; `thinking` → `model_profiles[agent].effort` and `thinking:` frontmatter.
- If a mapped source is missing from the active profile, the materializer fails with one line per unmapped agent naming the sources it tried, instead of silently dropping routing.

## Profiles

Two profiles live in `profiles/profiles.json`. Only one is `active` at a time.

### `sdd-opencode` (default active)

Mixed providers. OpenAI Codex for orchestration and heavy phases, plus `opencode-go` and `opencode` free tiers where useful.

### `sdd-opencode-go`

Every entry uses only the `opencode-go` subscription. Model routing follows two signals:

- **Benchmarks.** Artificial Analysis Coding Index and Intelligence Index as of Sep 2026:
  - `glm-5.3` and `kimi-k3` at the top for hard agentic coding (74.8 / 76.2 respectively), with 1M context.
  - `glm-5.3-flash` (71.5) and `qwen3.8-flash` (73.0) offer strong coding output at far lower cost and higher throughput.
  - `kimi-k2.7-code` is code-specialized with a high monthly request ceiling.
  - `mimo-v2.6-pro` and `qwen3.7-plus` sit in the useful mid-tier with generous limits.
  - `deepseek-v4-flash` is the cheapest, fastest, highest-ceiling workhorse.
- **Go monthly budget.** Each model has a dollar limit per month. Expensive top-tier models like `kimi-k3` (~490 req/mo) and `glm-5.3` (~1,080 req/mo) burn quickly. Cheaper Flash/Plus/DeepSeek entries allow tens of thousands of requests.

Assignments follow that split:

| Phase | Model | Why |
| --- | --- | --- |
| `orchestrator` | `qwen3.8-flash` | Runs every session; AA Coding 73.0 at $0.15/$0.47 keeps budget intact. |
| `sdd-explore` | `glm-5.3` | Deep codebase reasoning; 1M context; AA Coding 74.8. |
| `sdd-proposal` | `glm-5.3` | Analysis and scoping need top open-tier judgment. |
| `sdd-design` | `glm-5.3` | Architectural decisions; low per-change frequency. |
| `sdd-spec` | `kimi-k3` | Long-form writing quality; 1M context for large specs. |
| `sdd-research` | `kimi-k3` | Multi-source synthesis; AA Coding 76.2; few calls per change. |
| `sdd-tasks` | `mimo-v2.6-pro` | Mechanical breakdown; AA Intelligence 46.3; high ceiling. |
| `sdd-apply` | `kimi-k2.7-code` | Code-specialized, generous ~6,750 req/mo. |
| `sdd-verify` | `glm-5.3-flash` | Rigorous review, faster + cheaper than `glm-5.3`. |
| `sdd-remediate` | `glm-5.3-flash` | Bounded fixes; frequent enough to justify the flash tier. |
| `sdd-onboard` | `qwen3.7-plus` | Guided walkthrough; AA Coding 66.0 at high ceiling. |
| `sdd-init` | `deepseek-v4-flash` | Bootstrap scaffolding; cheap and fast. |
| `sdd-status` | `deepseek-v4-flash` | Read-only report. |
| `sdd-archive` | `deepseek-v4-flash` | Closure write-up. |

## Switching profiles

Preview the switch without touching anything:

```bash
scripts/set-active-profile sdd-opencode-go --dry-run
```

Switch and materialize immediately:

```bash
scripts/set-active-profile sdd-opencode-go
```

Switch and materialize only via a full sync (also runs `gentle-ai sync --agent pi`):

```bash
scripts/set-active-profile sdd-opencode-go --no-apply
scripts/sync-pi-gentle
```

`set-active-profile` refuses unknown names, prints the reason, and only rewrites `active` after that check passes.

## Apply on this machine

```bash
scripts/sync-pi-gentle
```

The script:

1. Verifies `pi`, `gentle-ai`, and `node` are available.
2. Runs `gentle-ai sync --agent pi` unless `--no-gentle-sync` is passed.
3. Backs up existing target files.
4. Copies `profiles.json` and `kairos.md` into Pi.
5. Runs `apply-active-profile.mjs`, which translates the active profile's phase roles into Pi agent routing.
6. Re-validates everything.

To refresh the vendored Kairos agent from OpenCode first:

```bash
scripts/generate-kairos-agent
scripts/sync-pi-gentle
```

## Verify without changing files

```bash
scripts/verify-pi-gentle
scripts/apply-active-profile.mjs --dry-run
scripts/apply-active-profile.mjs --print-roles
```

`apply-active-profile.mjs --dry-run` prints the exact targets it would rewrite (including every mapped agent frontmatter) without touching them. `--print-roles` dumps the resolved phase-key → Pi-agent routing as JSON; it performs no writes and is what `verify-models.mjs` consumes, so the mapping has exactly one source of truth.

`scripts/verify-pi-gentle` checks two layers:

1. **Contract (always fatal).** Every model id in every profile resolves against `~/.pi/agent/models-store.json` (OpenCode phase validation stays intact), the role translation yields a complete routing for the active profile, every mapped agent resolves a model, no target is an unmapped phase key, and no duplicates.
2. **Machine state (advisory by default).** Materialized `~/.pi/gentle-ai/profiles.json` and `~/.pi/gentle-ai/models.json` are checked for Pi-native keys only (`orchestrator` plus the mapped Pi agents) and complete profiles. `subagents.json` keys and `~/.pi/agent/agents/*.md` frontmatter are compared against installed agent definitions and the resolved routing. Warnings only, so `sync-pi-gentle` can verify *before* it has applied anything on a fresh machine. Legacy `sdd-*` keys in any runtime store show up as drift that the next apply removes.

After applying, enforce layer 2:

```bash
scripts/apply-active-profile.mjs
scripts/verify-pi-gentle --strict-materialized
```

`--strict-materialized` turns every machine-state warning into a failure: mapped agent not installed, frontmatter model mismatch, model_profiles missing a mapped agent, or an unknown `model_profiles` key with no installed agent (that one is always fatal).

If anything fails, paste the full output into the agent. The output is designed to be diagnostic: missing command, invalid JSON, missing model, missing target file, unmapped source, etc.

## What this repo intentionally does not manage

- `~/.pi/agent/auth.json`
- `~/.pi/agent/sessions/`
- `~/.pi/agent/settings.json` beyond the three orchestrator keys
- API keys or provider credentials
- remote repositories, commits, or pushes

## Kairos source

`profiles/agents/kairos.md` is generated from:

```text
~/.config/opencode/prompts/kairos.md
```

The generated Pi agent keeps the prompt body intact and adds Pi-native frontmatter (`name`, `description`, `model`, and allowed tools). Re-run `scripts/generate-kairos-agent` after updating the OpenCode Kairos prompt.
