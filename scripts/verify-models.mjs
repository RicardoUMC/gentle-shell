#!/usr/bin/env node
// Validate Gentle Pi's official profile contract: profile keys are agent names
// accepted by gentle-pi, with "orchestrator" as the only reserved key.

import fs from "node:fs";
import path from "node:path";

const [root, piAgentHome, ...flags] = process.argv.slice(2);
if (!root || !piAgentHome) {
  console.error("usage: verify-models.mjs <repo-root> <pi-agent-home> [--strict-materialized]");
  process.exit(1);
}
const strict = flags.includes("--strict-materialized");
const gentleHome = path.join(path.dirname(piAgentHome), "gentle-ai");
const sourcePath = path.join(root, "profiles", "profiles.json");
const storePath = path.join(piAgentHome, "models-store.json");
const ORCHESTRATOR = "orchestrator";
const OFFICIAL = new Set([
  "gentle-ai-explore", "gentle-ai-verify", "gentle-ai-worker",
  "jd-fix-agent", "jd-judge-a", "jd-judge-b", "kairos",
  "review-readability", "review-reliability", "review-resilience", "review-risk",
  "sdd-init", "sdd-onboard", "sdd-explore", "sdd-research", "sdd-proposal",
  "sdd-spec", "sdd-design", "sdd-tasks", "sdd-status", "sdd-apply",
  "sdd-verify", "sdd-archive", "sdd-remediate",
]);

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}
function report(message) {
  if (strict) fail(message);
  else console.error(`warn: ${message}`);
}
function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (error) { fail(`unreadable ${file}: ${error.message}`); return undefined; }
}

const doc = readJson(sourcePath);
const store = readJson(storePath);
if (!doc || !store) process.exit(1);
if (doc.kind !== "gentle-pi.agent_model_profiles" || doc.version !== 1) fail("invalid profiles.json envelope");
if (typeof doc.active !== "string" || !doc.profiles?.[doc.active]) fail(`invalid active profile: ${doc.active ?? "(none)"}`);
if (process.exitCode) process.exit(1);

const models = new Set();
for (const [profileName, profile] of Object.entries(doc.profiles ?? {})) {
  if (!profile || typeof profile !== "object") { fail(`profile is not an object: ${profileName}`); continue; }
  for (const [agent, entry] of Object.entries(profile)) {
    if (agent !== ORCHESTRATOR && !OFFICIAL.has(agent)) fail(`non-official Pi agent key: ${agent}`);
    if (entry?.model) models.add(entry.model);
  }
}
for (const model of [...models].sort()) {
  const slash = model.indexOf("/");
  if (slash <= 0 || slash === model.length - 1) { fail(`invalid model id: ${model}`); continue; }
  const provider = model.slice(0, slash);
  const id = model.slice(slash + 1);
  const found = Array.isArray(store[provider]?.models) && store[provider].models.some((item) => item?.id === id);
  if (!found) fail(`missing model: ${model}`);
  else console.log(`ok model: ${model}`);
}

const sourceActive = doc.profiles[doc.active];
function checkRuntime(file, value, label, expectedKeys) {
  if (!value || typeof value !== "object") { report(`missing or invalid ${label}: ${file}`); return; }
  const keys = new Set(Object.keys(value));
  for (const key of keys) if (!expectedKeys.has(key)) report(`${label} has unexpected key: ${key}`);
  for (const key of expectedKeys) if (!keys.has(key)) report(`${label} is missing key: ${key}`);
  if ([...keys].every((key) => expectedKeys.has(key)) && [...expectedKeys].every((key) => keys.has(key))) {
    console.log(`ok ${label}: official keys match active profile`);
  }
}

const liveProfiles = readJson(path.join(gentleHome, "profiles.json"));
if (liveProfiles) {
  for (const [name, profile] of Object.entries(doc.profiles)) {
    const live = liveProfiles.profiles?.[name];
    const expected = new Set(Object.keys(profile));
    checkRuntime(path.join(gentleHome, "profiles.json"), live, `live profile ${name}`, expected);
    if (name === doc.active && live) {
      if (JSON.stringify(live) !== JSON.stringify(profile)) report(`live profile ${name} differs from source`);
    }
  }
}
const liveModels = readJson(path.join(gentleHome, "models.json"));
if (liveModels) checkRuntime(path.join(gentleHome, "models.json"), liveModels, "live models.json", new Set(Object.keys(sourceActive)));

const subagents = readJson(path.join(piAgentHome, "subagents.json"));
if (subagents?.model_profiles) checkRuntime(path.join(piAgentHome, "subagents.json"), subagents.model_profiles, "model_profiles", new Set(Object.keys(sourceActive).filter((name) => name !== ORCHESTRATOR)));
else report(`missing model_profiles: ${path.join(piAgentHome, "subagents.json")}`);

const agentsDir = path.join(piAgentHome, "agents");
if (fs.existsSync(agentsDir)) {
  for (const agent of Object.keys(sourceActive).filter((name) => name !== ORCHESTRATOR)) {
    if (!fs.existsSync(path.join(agentsDir, `${agent}.md`))) report(`official agent asset not installed: ${agent}.md`);
  }
}

if (process.exitCode) process.exit(1);
