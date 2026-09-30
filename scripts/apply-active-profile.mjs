#!/usr/bin/env node
// Materialize profiles.json using Gentle Pi's official routing contract.
// Profile keys are Pi agent names exactly as shipped by gentle-pi. The only
// reserved key is "orchestrator"; Pi writes it to settings.json and excludes
// it from agent-facing stores.

import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const printRoles = argv.includes("--print-roles");
const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const gentleHome = path.join(process.env.HOME, ".pi/gentle-ai");
const piAgentHome = process.env.PI_CODING_AGENT_DIR || path.join(process.env.HOME, ".pi/agent");
const sourcePath = path.join(repoRoot, "profiles", "profiles.json");

const OFFICIAL_AGENT_NAMES = new Set([
  "gentle-ai-explore", "gentle-ai-verify", "gentle-ai-worker",
  "jd-fix-agent", "jd-judge-a", "jd-judge-b", "kairos",
  "review-readability", "review-reliability", "review-resilience", "review-risk",
  "sdd-init", "sdd-onboard", "sdd-explore", "sdd-research", "sdd-proposal",
  "sdd-spec", "sdd-design", "sdd-tasks", "sdd-status", "sdd-apply",
  "sdd-verify", "sdd-archive", "sdd-remediate",
]);

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!fs.existsSync(sourcePath)) fail(`missing source: ${sourcePath}`);
const doc = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
if (doc.kind !== "gentle-pi.agent_model_profiles" || doc.version !== 1) {
  fail("invalid profiles.json envelope");
}
if (typeof doc.active !== "string" || !doc.profiles?.[doc.active]) {
  fail(`active profile is missing or unknown: ${doc.active ?? "(none)"}`);
}

for (const [profileName, profile] of Object.entries(doc.profiles)) {
  for (const agent of Object.keys(profile)) {
    if (agent === "orchestrator") continue;
    if (!OFFICIAL_AGENT_NAMES.has(agent)) {
      fail(`profile "${profileName}" contains non-official Pi agent key: ${agent}`);
    }
  }
}

const activeProfile = doc.profiles[doc.active];
const orchestrator = activeProfile.orchestrator;
const agentEntries = Object.fromEntries(
  Object.entries(activeProfile).filter(([name]) => name !== "orchestrator"),
);

if (printRoles) {
  process.stdout.write(`${JSON.stringify({ active: doc.active, routing: activeProfile }, null, 2)}\n`);
  process.exit(0);
}

function readJson(p) {
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (error) {
    fail(`unreadable ${p}: ${error.message}`);
  }
}

function writeAtomic(p, text) {
  if (dryRun) return;
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, p);
}

function maybeWrite(p, text) {
  const previous = fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
  if (previous === text) console.log(`unchanged: ${p}`);
  else {
    writeAtomic(p, text);
    console.log(`${dryRun ? "would write" : "wrote"}: ${p}`);
  }
}

// Gentle Pi's profiles.json and models.json use agent keys verbatim.
maybeWrite(
  path.join(gentleHome, "profiles.json"),
  `${JSON.stringify(doc, null, 2)}\n`,
);
maybeWrite(
  path.join(gentleHome, "models.json"),
  `${JSON.stringify(activeProfile, null, 2)}\n`,
);

const subagentsPath = path.join(piAgentHome, "subagents.json");
const subagents = readJson(subagentsPath);
const modelProfiles = {};
for (const [agent, entry] of Object.entries(agentEntries)) {
  const runtimeEntry = {};
  if (entry.model) runtimeEntry.model = entry.model;
  if (entry.thinking) runtimeEntry.effort = entry.thinking;
  if (Object.keys(runtimeEntry).length > 0) modelProfiles[agent] = runtimeEntry;
}
maybeWrite(
  subagentsPath,
  `${JSON.stringify({ ...subagents, model_profiles: modelProfiles }, null, 2)}\n`,
);

if (orchestrator?.model) {
  const separator = orchestrator.model.indexOf("/");
  if (separator <= 0 || separator === orchestrator.model.length - 1) {
    fail(`orchestrator.model must be provider/model: ${orchestrator.model}`);
  }
  const settingsPath = path.join(piAgentHome, "settings.json");
  const settings = readJson(settingsPath);
  const next = {
    ...settings,
    defaultProvider: orchestrator.model.slice(0, separator),
    defaultModel: orchestrator.model.slice(separator + 1),
  };
  if (orchestrator.thinking) next.defaultThinkingLevel = orchestrator.thinking;
  else delete next.defaultThinkingLevel;
  maybeWrite(settingsPath, `${JSON.stringify(next, null, 2)}\n`);
}

const agentsDir = path.join(piAgentHome, "agents");
if (fs.existsSync(agentsDir)) {
  for (const [agent, entry] of Object.entries(agentEntries)) {
    const file = path.join(agentsDir, `${agent}.md`);
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, "utf8");
    if (!content.startsWith("---\n")) continue;
    const end = content.indexOf("\n---", 4);
    if (end < 0) continue;
    const lines = content.slice(4, end).split("\n")
      .filter((line) => !line.startsWith("model:") && !line.startsWith("thinking:"));
    const inserts = [];
    if (entry.model) inserts.push(`model: ${entry.model}`);
    if (entry.thinking) inserts.push(`thinking: ${entry.thinking}`);
    const description = lines.findIndex((line) => line.startsWith("description:"));
    lines.splice(description >= 0 ? description + 1 : Math.min(1, lines.length), 0, ...inserts);
    maybeWrite(file, `---\n${lines.join("\n")}${content.slice(end)}`);
  }
}
