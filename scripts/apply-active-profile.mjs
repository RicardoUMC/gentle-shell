#!/usr/bin/env node
// Materialize the active profile from profiles/profiles.json into Pi runtime
// files. Mirrors what `/gentle:profiles` does when applying a profile, with one
// difference: source profiles are OpenCode/SDD phase-keyed, but the Pi runtime
// stores (~/.pi/gentle-ai/profiles.json and ~/.pi/gentle-ai/models.json) must
// contain only Pi-native agent keys. Every source profile is therefore translated
// before it reaches the runtime.
//
// Runtime writes:
//   - ~/.pi/gentle-ai/profiles.json  ← translated profiles envelope
//   - ~/.pi/gentle-ai/models.json    ← translated active profile
//   - ~/.pi/agent/subagents.json     ← model_profiles keyed by Pi agent name
//   - ~/.pi/agent/settings.json      ← defaultProvider/Model/ThinkingLevel
//   - ~/.pi/agent/agents/<name>.md   ← model/thinking frontmatter per agent
//
// Source keys are OpenCode/SDD phase names (`sdd-init`, `sdd-explore`, ...).
// They are translated into Pi agent names by ROLE_TRANSLATION before any runtime
// write. Phase keys are never copied verbatim into Pi runtime files.
//
// Safe by default: run with --dry-run to see what would change without writes.
// Run with --print-roles to dump the resolved routing as JSON without writes.

import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const printRoles = argv.includes("--print-roles");
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
if (!doc.profiles || typeof doc.profiles !== "object") {
  console.error(`profiles.json has no "profiles" object`);
  process.exit(1);
}

const ORCH_KEY = "orchestrator";

// Deterministic OpenCode/SDD phase key -> installed Pi agent translation.
// One target agent per entry; sources are tried in order and the first present
// one wins. Keys are never copied verbatim into Pi routing.
//
//   sdd-explore   -> gentle-ai-explore   (read-only mapping/scout role)
//   sdd-apply     -> gentle-ai-worker    (bounded scoped writer role)
//   sdd-verify    -> gentle-ai-verify    (command-running verifier role)
//   sdd-verify    -> jd-judge-a/b + review-{risk,resilience,readability,
//                   reliability}        (Judgment-Day and review-lens roles
//                   share the verification model)
//   sdd-remediate -> jd-fix-agent        (falls back to sdd-apply when the
//                   profile has no remediate phase)
//   orchestrator  -> kairos             (dedicated coordinator agent)
const ROLE_TRANSLATION = [
  { agent: "gentle-ai-explore", sources: ["sdd-explore"] },
  { agent: "gentle-ai-verify", sources: ["sdd-verify"] },
  { agent: "gentle-ai-worker", sources: ["sdd-apply"] },
  { agent: "jd-fix-agent", sources: ["sdd-remediate", "sdd-apply"] },
  { agent: "jd-judge-a", sources: ["sdd-verify"] },
  { agent: "jd-judge-b", sources: ["sdd-verify"] },
  { agent: "kairos", sources: [ORCH_KEY] },
  { agent: "review-readability", sources: ["sdd-verify"] },
  { agent: "review-reliability", sources: ["sdd-verify"] },
  { agent: "review-resilience", sources: ["sdd-verify"] },
  { agent: "review-risk", sources: ["sdd-verify"] },
];

function fail(message) {
  console.error(message);
  process.exit(1);
}

function translateProfiles(sourceProfiles) {
  const translatedProfiles = {};
  const routingByProfile = {};
  const errors = [];

  for (const [name, source] of Object.entries(sourceProfiles)) {
    if (!source || typeof source !== "object") {
      errors.push(`profile "${name}": not an object`);
      continue;
    }

    const translated = {};
    const routing = [];

    // Orchestrator stays under the reserved orchestrator key.
    if (
      Object.prototype.hasOwnProperty.call(source, ORCH_KEY) &&
      source[ORCH_KEY] &&
      typeof source[ORCH_KEY] === "object"
    ) {
      translated[ORCH_KEY] = source[ORCH_KEY];
    }

    for (const { agent, sources } of ROLE_TRANSLATION) {
      if (agent.startsWith("sdd-")) {
        fail(
          `internal: routing target must be a Pi agent name, not a phase key: ${agent}`,
        );
      }
      const sourceKey = sources.find(
        (key) =>
          Object.prototype.hasOwnProperty.call(source, key) &&
          source[key] &&
          typeof source[key] === "object",
      );
      if (!sourceKey) {
        errors.push(
          `profile "${name}": missing mapped source for "${agent}" (tried ${sources.map((s) => `"${s}"`).join(", ")})`,
        );
        continue;
      }
      translated[agent] = source[sourceKey];
      routing.push({ agent, source: sourceKey, entry: source[sourceKey] });
    }

    translatedProfiles[name] = translated;
    routingByProfile[name] = routing;
  }

  return { translatedProfiles, routingByProfile, errors };
}

const { translatedProfiles, routingByProfile, errors } = translateProfiles(
  doc.profiles,
);
if (errors.length > 0) {
  for (const msg of errors) console.error(msg);
  fail(`cannot translate one or more profiles to Pi-native runtime keys`);
}

const activeProfile = doc.profiles[doc.active];
if (!activeProfile) {
  console.error(`active profile "${doc.active}" not found`);
  process.exit(1);
}
const activeTranslated = translatedProfiles[doc.active];
const activeRouting = routingByProfile[doc.active];
const orchestrator = activeProfile[ORCH_KEY];

if (printRoles) {
  const out = {
    active: doc.active,
    routing: activeRouting.map(({ agent, source, entry }) => ({
      agent,
      source,
      ...(entry.model ? { model: entry.model } : {}),
      ...(entry.thinking ? { thinking: entry.thinking } : {}),
    })),
  };
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  process.exit(0);
}

const profilesTarget = path.join(gentleHome, "profiles.json");
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

function maybeWrite(p, nextText) {
  const prev = fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
  if (prev === nextText) {
    console.log(`unchanged: ${p}`);
  } else {
    writeFileAtomic(p, nextText);
    console.log(`${dryRun ? "would write" : "wrote"}: ${p}`);
  }
}

// 1) profiles.json = translated profiles envelope (Pi-native keys only)
{
  const nextEnvelope = {
    kind: doc.kind,
    version: doc.version,
    active: doc.active,
    profiles: translatedProfiles,
  };
  maybeWrite(profilesTarget, `${JSON.stringify(nextEnvelope, null, 2)}\n`);
}

// 2) models.json = translated active profile only (Pi-native keys only)
{
  maybeWrite(modelsTarget, `${JSON.stringify(activeTranslated, null, 2)}\n`);
}

// 3) subagents.json = preserve other keys, set model_profiles keyed by Pi agent
{
  const current = readJsonIfPresent(subagentsTarget) ?? {};
  const modelProfiles = {};
  for (const { agent, entry } of activeRouting) {
    const p = {};
    if (entry.model) p.model = entry.model;
    if (entry.thinking) p.effort = entry.thinking;
    if (Object.keys(p).length === 0) {
      console.log(`skipped (no model or thinking): ${agent}`);
      continue;
    }
    modelProfiles[agent] = p;
  }
  const nextCfg = { ...current, model_profiles: modelProfiles };
  maybeWrite(subagentsTarget, `${JSON.stringify(nextCfg, null, 2)}\n`);
}

// 4) settings.json orchestrator keys
if (orchestrator?.model) {
  const ref = parseProviderModel(orchestrator.model);
  if (!ref) {
    console.error(
      `orchestrator.model must be provider/model: ${orchestrator.model}`,
    );
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
  maybeWrite(settingsTarget, `${JSON.stringify(nextCfg, null, 2)}\n`);
} else {
  console.log("skipped: orchestrator (no model in active profile)");
}

// 5) agent .md frontmatter routing for mapped Pi agents that already exist
if (fs.existsSync(agentsDir)) {
  for (const { agent, entry } of activeRouting) {
    const file = path.join(agentsDir, `${agent}.md`);
    if (!fs.existsSync(file)) {
      console.log(`skipped (no agent file): ${agent}`);
      continue;
    }
    const content = fs.readFileSync(file, "utf8");
    const updated = updateFrontmatter(content, entry);
    if (updated === null) {
      console.log(`skipped (no frontmatter): ${file}`);
      continue;
    }
    maybeWrite(file, updated);
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
  const next = `---\n${kept.join("\n")}${body}`;
  if (next === content) return content;
  return next;
}
