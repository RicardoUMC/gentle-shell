# Gentle Pi Config

Personal, reproducible Gentle Shell / Pi overlays for Ricardo's machines.

This repository does **not** install Pi itself and does **not** own secrets, auth files, sessions, or the full `~/.pi` directory. It only stores the small configuration overlays that should survive `gentle-ai sync --agent pi` and machine rebuilds.

## What this repo manages

- `profiles/profiles.json` → copied to `~/.pi/gentle-ai/profiles.json`
- `profiles/models.json` → copied to `~/.pi/gentle-ai/models.json`
- `profiles/subagents.json` → copied to `~/.pi/agent/subagents.json`
- `profiles/agents/kairos.md` → copied to `~/.pi/agent/agents/kairos.md`

Current profile:

- `sdd-opencode`

Current custom agent:

- `kairos` — generated from the OpenCode Kairos prompt with Pi frontmatter.

## Apply on this machine

```bash
scripts/sync-pi-gentle
```

The script:

1. Verifies `pi`, `gentle-ai`, and `node` are available.
2. Runs `gentle-ai sync --agent pi` unless `--no-gentle-sync` is passed.
3. Backs up existing target files.
4. Copies the overlays from this repo.
5. Validates JSON and checks that every referenced model exists in Pi's `models-store.json`.

To refresh the vendored Kairos agent from OpenCode first:

```bash
scripts/generate-kairos-agent
scripts/sync-pi-gentle
```

## Verify without changing files

```bash
scripts/verify-pi-gentle
```

If anything fails, paste the full output into the agent. The output is designed to be diagnostic: missing command, invalid JSON, missing model, missing target file, etc.

## What this repo intentionally does not manage

- `~/.pi/agent/auth.json`
- `~/.pi/agent/sessions/`
- `~/.pi/agent/settings.json` as a whole
- API keys or provider credentials
- remote repositories, commits, or pushes

## Kairos source

`profiles/agents/kairos.md` is generated from:

```text
~/.config/opencode/prompts/kairos.md
```

The generated Pi agent keeps the prompt body intact and adds Pi-native frontmatter (`name`, `description`, `model`, and allowed tools). Re-run `scripts/generate-kairos-agent` after updating the OpenCode Kairos prompt.
