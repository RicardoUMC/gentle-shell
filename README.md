# Gentle Pi Config

Personal, reproducible Gentle Shell / Pi overlays for Ricardo's machines.

This repository does **not** install Pi itself and does **not** own secrets, auth files, sessions, or the full `~/.pi` directory. It only stores the small configuration overlays that should survive `gentle-ai sync --agent pi` and machine rebuilds.

## What this repo manages

- `profiles/profiles.json` → copied to `~/.pi/gentle-ai/profiles.json`, and materialized through `apply-active-profile.mjs` into:
  - `~/.pi/gentle-ai/models.json`
  - `~/.pi/agent/subagents.json`
  - `~/.pi/agent/settings.json` (only the three `defaultProvider`/`defaultModel`/`defaultThinkingLevel` keys)
  - `~/.pi/agent/agents/<name>.md` frontmatter (`model:` / `thinking:`) for agents that already exist
- `profiles/agents/kairos.md` → copied to `~/.pi/agent/agents/kairos.md`

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
5. Runs `apply-active-profile.mjs` to materialize the active profile.
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
```

If anything fails, paste the full output into the agent. The output is designed to be diagnostic: missing command, invalid JSON, missing model, missing target file, etc.

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
