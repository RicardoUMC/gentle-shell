#!/usr/bin/env node
// Materialize the active profile from profiles/profiles.json into Pi runtime
// files. Mirrors what `/gentle:profiles` does when applying a profile:
//   - ~/.pi/gentle-ai/models.json  ← full profile (incl. orchestrator)
//   - ~/.pi/agent/subagents.json   ← model_profiles (excl. orchestrator)
//   - ~/.pi/agent/settings.json    ← defaultProvider/Model/ThinkingLevel
//   - ~/.pi/agent/agents/<name>.md ← model/thinking frontmatter per agent
//
// Safe by default: run with --dry-run to see what would change without writes.

import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);

const gentleHome = path.join(process.env.HOME, ".pi/gentle-ai");
const piAgentHome =
  process.env.PI_CODING_AGENT_DIR || path.join(process.env.HOME, ".pi/agent");

const profilesSource = path.join(repoRoot, "profiles", "profiles.json");
if (!fs.existsSync(profilesSource)) {
  console.error(`missing source: ${profilesSource}`);
  process.exit(1);
}

const doc = JSON.parse(fs.readFileSync(profilesSource, "utf8"));
if (doc.kind !== "gentle-pi.agent_model_profiles" || doc.version !== 1) {
  console.error(`invalid profiles.json envelope`);
  process.exit(1);
}
if (typeof doc.active !== "string") {
  console.error(`profiles.json has no "active" key`);
  process.exit(1);
}
const profile = doc.profiles?.[doc.active];
if (!profile) {
  console.error(`active profile "${doc.active}" not found`);
  process.exit(1);
}

const ORCH_KEY = "orchestrator";
const entries = Object.fromEntries(
  Object.entries(profile).filter(([name]) => name !== ORCH_KEY),
);
const orchestrator = profile[ORCH_KEY];

const modelsTarget = path.join(gentleHome, "models.json");
const subagentsTarget = path.join(piAgentHome, "subagents.json");
const settingsTarget = path.join(piAgentHome, "settings.json");
const agentsDir = path.join(piAgentHome, "agents");

function readJsonIfPresent(p) {
  if (!fs.existsSync(p)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    console.error(`unreadable ${p}: ${e.message}`);
    return undefined;
  }
}

function writeFileAtomic(p, text) {
  if (dryRun) return;
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, p);
}

// 1) models.json = active profile verbatim (includes orchestrator key)
{
  const next = `${JSON.stringify(profile, null, 2)}\n`;
  const prev = fs.existsSync(modelsTarget) ? fs.readFileSync(modelsTarget, "utf8") : "";
  if (prev === next) {
    console.log(`unchanged: ${modelsTarget}`);
  } else {
    writeFileAtomic(modelsTarget, next);
    console.log(`${dryRun ? "would write" : "wrote"}: ${modelsTarget}`);
  }
}

// 2) subagents.json = preserve other keys, set model_profiles
{
  const current = readJsonIfPresent(subagentsTarget) ?? {};
  const modelProfiles = {};
  for (const [name, entry] of Object.entries(entries)) {
    const p = {};
    if (entry.model) p.model = entry.model;
    if (entry.thinking) p.effort = entry.thinking;
    if (Object.keys(p).length > 0) modelProfiles[name] = p;
  }
  const nextCfg = { ...current, model_profiles: modelProfiles };
  const next = `${JSON.stringify(nextCfg, null, 2)}\n`;
  const prev = fs.existsSync(subagentsTarget) ? fs.readFileSync(subagentsTarget, "utf8") : "";
  if (prev === next) {
    console.log(`unchanged: ${subagentsTarget}`);
  } else {
    writeFileAtomic(subagentsTarget, next);
    console.log(`${dryRun ? "would write" : "wrote"}: ${subagentsTarget}`);
  }
}

// 3) settings.json orchestrator keys
if (orchestrator?.model) {
  const ref = parseProviderModel(orchestrator.model);
  if (!ref) {
    console.error(`orchestrator.model must be provider/model: ${orchestrator.model}`);
    process.exit(1);
  }
  const current = readJsonIfPresent(settingsTarget);
  if (current === undefined && fs.existsSync(settingsTarget)) {
    console.error(`unreadable settings, refusing to overwrite: ${settingsTarget}`);
    process.exit(1);
  }
  const nextCfg = { ...(current ?? {}) };
  nextCfg.defaultProvider = ref.provider;
  nextCfg.defaultModel = ref.model;
  if (orchestrator.thinking) nextCfg.defaultThinkingLevel = orchestrator.thinking;
  else delete nextCfg.defaultThinkingLevel;
  const next = `${JSON.stringify(nextCfg, null, 2)}\n`;
  const prev = fs.existsSync(settingsTarget) ? fs.readFileSync(settingsTarget, "utf8") : "";
  if (prev === next) {
    console.log(`unchanged: ${settingsTarget}`);
  } else {
    writeFileAtomic(settingsTarget, next);
    console.log(`${dryRun ? "would write" : "wrote"}: ${settingsTarget}`);
  }
} else {
  console.log("skipped: orchestrator (no model in active profile)");
}

// 4) agent .md frontmatter routing for named agents that already exist
if (fs.existsSync(agentsDir)) {
  for (const [name, entry] of Object.entries(entries)) {
    const file = path.join(agentsDir, `${name}.md`);
    if (!fs.existsSync(file)) {
      console.log(`skipped (no agent file): ${name}`);
      continue;
    }
    const content = fs.readFileSync(file, "utf8");
    const updated = updateFrontmatter(content, entry);
    if (updated === null) {
      console.log(`skipped (no frontmatter): ${file}`);
      continue;
    }
    if (updated === content) {
      console.log(`unchanged: ${file}`);
      continue;
    }
    writeFileAtomic(file, updated);
    console.log(`${dryRun ? "would write" : "wrote"}: ${file}`);
  }
}

function parseProviderModel(value) {
  const i = value.indexOf("/");
  if (i <= 0 || i === value.length - 1) return undefined;
  return { provider: value.slice(0, i), model: value.slice(i + 1) };
}

function updateFrontmatter(content, entry) {
  if (!content.startsWith("---\n")) return null;
  const end = content.indexOf("\n---", 4);
  if (end === -1) return null;
  const lines = content.slice(4, end).split("\n");
  const body = content.slice(end);
  const kept = lines.filter(
    (l) => !l.startsWith("model:") && !l.startsWith("thinking:"),
  );
  const insert = [];
  if (entry.model) insert.push(`model: ${entry.model}`);
  if (entry.thinking) insert.push(`thinking: ${entry.thinking}`);
  if (insert.length > 0) {
    const descIdx = kept.findIndex((l) => l.startsWith("description:"));
    const at = descIdx >= 0 ? descIdx + 1 : Math.min(1, kept.length);
    kept.splice(at, 0, ...insert);
  }
  return `---\n${kept.join("\n")}${body}`;
}
