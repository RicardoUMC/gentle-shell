#!/usr/bin/env node
// Validate the Gentle Pi model routing contract.
//
// Two layers:
//   1. Repo-side (always fatal): every model id in every profile resolves
//      against the Pi model catalog, and the role translation in
//      scripts/apply-active-profile.mjs produces a complete routing for the
//      active profile (every mapped Pi agent gets a model).
//   2. Machine-side (fatal only with --strict-materialized): the live
//      ~/.pi/gentle-ai/profiles.json and ~/.pi/gentle-ai/models.json contain
//      only Pi-native agent keys (plus orchestrator) and every profile is
//      complete. Also, ~/.pi/agent/subagents.json keys and
//      ~/.pi/agent/agents/*.md frontmatter correspond to installed agent
//      definitions and to the resolved routing.
//      Tolerated without the flag so `sync-pi-gentle` can verify before it has
//      applied anything.
//
// usage: verify-models.mjs <repo-root> <pi-agent-home> [--strict-materialized]
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const positional = [];
const flags = new Set();
for (const arg of process.argv.slice(2)) {
  if (arg.startsWith("--")) flags.add(arg);
  else positional.push(arg);
}
const [root, piAgentHome] = positional;
if (!root || !piAgentHome) {
  console.error(
    "usage: verify-models.mjs <repo-root> <pi-agent-home> [--strict-materialized]",
  );
  process.exit(1);
}
const strictMaterialized = flags.has("--strict-materialized");

const gentleHome = path.join(path.dirname(piAgentHome), "gentle-ai");
const ORCH_KEY = "orchestrator";

const storePath = path.join(piAgentHome, "models-store.json");
if (!fs.existsSync(storePath)) {
  console.error(`missing Pi model catalog: ${storePath}`);
  process.exit(1);
}

const store = JSON.parse(fs.readFileSync(storePath, "utf8"));
const profilesPath = path.join(root, "profiles", "profiles.json");
if (!fs.existsSync(profilesPath)) {
  console.error(`missing profiles.json: ${profilesPath}`);
  process.exit(1);
}
const doc = JSON.parse(fs.readFileSync(profilesPath, "utf8"));

if (typeof doc.active !== "string" || !doc.profiles || !doc.profiles[doc.active]) {
  console.error(`profiles.json has no valid active profile`);
  process.exit(1);
}

const profileNames = Object.keys(doc.profiles).sort();
if (!profileNames.length) {
  console.error("profiles.json has no profiles");
  process.exit(1);
}
console.log(`verifying ${profileNames.length} profiles (active: ${doc.active})`);

let failed = false;
function fail(message) {
  console.error(message);
  failed = true;
}
// Machine-side findings are advisory unless --strict-materialized is passed.
function report(message) {
  if (strictMaterialized) fail(message);
  else console.error(`warn: ${message}`);
}

const models = new Set();
function visit(value) {
  if (Array.isArray(value)) {
    for (const item of value) visit(item);
    return;
  }
  if (!value || typeof value !== "object") return;
  if (typeof value.model === "string") models.add(value.model);
  for (const item of Object.values(value)) visit(item);
}

for (const name of profileNames) visit(doc.profiles[name]);

// Layer 1a: OpenCode/SDD phase models must exist in the Pi model catalog.
for (const model of [...models].sort()) {
  const slash = model.indexOf("/");
  if (slash <= 0 || slash === model.length - 1) {
    fail(`invalid model id: ${model}`);
    continue;
  }
  const provider = model.slice(0, slash);
  const id = model.slice(slash + 1);
  const providerModels = Array.isArray(store[provider]?.models) ? store[provider].models : [];
  const found = providerModels.some((entry) => entry?.id === id);
  if (!found) {
    fail(`missing model: ${model}`);
  } else {
    console.log(`ok model: ${model}`);
  }
}

// Layer 1b: ask the materializer for the resolved routing so the mapping has
// exactly one source of truth (--print-roles performs no writes).
const materializer = path.join(root, "scripts", "apply-active-profile.mjs");
if (!fs.existsSync(materializer)) {
  console.error(`missing materializer: ${materializer}`);
  process.exit(1);
}

let routing;
try {
  const out = execFileSync(process.execPath, [materializer, "--print-roles"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  routing = JSON.parse(out).routing;
} catch (e) {
  console.error(`role translation failed: ${e.message}`);
  process.exit(1);
}
if (!Array.isArray(routing) || routing.length === 0) {
  console.error("role translation produced no routing");
  process.exit(1);
}

const expectedAgents = new Set();
for (const { agent, source, model } of routing) {
  if (typeof agent !== "string" || !agent) {
    fail("routing entry has no agent name");
    continue;
  }
  if (expectedAgents.has(agent)) fail(`duplicate routing agent: ${agent}`);
  expectedAgents.add(agent);
  if (agent.startsWith("sdd-")) {
    fail(`routing key is an unmapped phase name, not a Pi agent: ${agent}`);
  }
  if (typeof model !== "string" || !model) {
    fail(`mapped agent resolves no model: ${agent} (source: ${source})`);
  }
}
const expectedKeys = new Set([ORCH_KEY, ...expectedAgents]);
console.log(`ok routing: ${expectedAgents.size} Pi agents mapped from "${doc.active}"`);

function checkProfileKeys(obj, label) {
  if (!obj || typeof obj !== "object") {
    report(`${label} is not an object`);
    return;
  }
  const keys = Object.keys(obj);
  const extra = keys.filter((k) => !expectedKeys.has(k));
  const missing = [...expectedKeys].filter((k) => !keys.includes(k));
  for (const key of extra.sort()) {
    if (key.startsWith("sdd-")) {
      report(`${label} contains phase key: ${key}`);
    } else {
      report(`${label} contains unexpected key: ${key}`);
    }
  }
  for (const key of missing.sort()) {
    report(`${label} is missing key: ${key}`);
  }
  if (!extra.length && !missing.length) {
    console.log(`ok ${label}: keys are Pi-native and complete`);
  }
}

// Layer 2a: live Gentle Pi runtime profile stores.
let liveDoc;
const liveProfilesPath = path.join(gentleHome, "profiles.json");
if (!fs.existsSync(liveProfilesPath)) {
  report(`missing live profiles.json: ${liveProfilesPath}`);
} else {
  try {
    liveDoc = JSON.parse(fs.readFileSync(liveProfilesPath, "utf8"));
  } catch (e) {
    console.error(`unreadable ${liveProfilesPath}: ${e.message}`);
    process.exit(1);
  }
  if (liveDoc.kind !== doc.kind || liveDoc.version !== doc.version) {
    report(`live profiles.json envelope mismatch`);
  }
  for (const name of profileNames) {
    checkProfileKeys(liveDoc.profiles?.[name], `live profile "${name}"`);
  }
}

const liveModelsPath = path.join(gentleHome, "models.json");
if (!fs.existsSync(liveModelsPath)) {
  report(`missing live models.json: ${liveModelsPath}`);
} else {
  let liveModels;
  try {
    liveModels = JSON.parse(fs.readFileSync(liveModelsPath, "utf8"));
  } catch (e) {
    console.error(`unreadable ${liveModelsPath}: ${e.message}`);
    process.exit(1);
  }
  checkProfileKeys(liveModels, "live models.json");
  if (liveDoc?.profiles?.[liveDoc.active]) {
    const expected = JSON.stringify(liveDoc.profiles[liveDoc.active]);
    const actual = JSON.stringify(liveModels);
    if (expected !== actual) {
      report(`live models.json does not match active profile in live profiles.json`);
    } else {
      console.log("ok live models.json: matches active profile in live profiles.json");
    }
  }
}

// Layer 2b: live Pi agent definitions and routing state.
const agentsDir = path.join(piAgentHome, "agents");
const subagentsPath = path.join(piAgentHome, "subagents.json");

if (!fs.existsSync(agentsDir)) {
  report(`missing agents dir: ${agentsDir}`);
} else {
  const installed = new Set(
    fs
      .readdirSync(agentsDir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.slice(0, -3)),
  );
  const missingAgents = [...expectedAgents].filter((a) => !installed.has(a));
  for (const agent of missingAgents.sort()) {
    report(`mapped agent is not installed: ${agent} (no ${agent}.md)`);
  }
  if (!missingAgents.length) {
    console.log("ok agents: every mapped agent has an installed definition");
  }

  // Frontmatter must carry the model the mapping resolves.
  let fmIssues = 0;
  for (const { agent, model } of routing) {
    if (typeof model !== "string" || !installed.has(agent)) continue;
    const file = path.join(agentsDir, `${agent}.md`);
    const fm = readFrontmatter(file);
    if (!fm) {
      report(`unreadable frontmatter: ${file}`);
      fmIssues += 1;
    } else if (fm.model !== model) {
      report(
        `frontmatter model mismatch: ${agent} has ${fm.model ?? "(none)"}, expected ${model}`,
      );
      fmIssues += 1;
    }
  }
  if (!fmIssues) console.log("ok frontmatter: mapped agents carry the resolved model");
}

if (fs.existsSync(subagentsPath)) {
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(subagentsPath, "utf8"));
  } catch (e) {
    console.error(`unreadable ${subagentsPath}: ${e.message}`);
    process.exit(1);
  }
  const modelProfiles = cfg?.model_profiles;
  if (!modelProfiles || typeof modelProfiles !== "object") {
    report(`no model_profiles in ${subagentsPath}`);
  } else {
    const keys = Object.keys(modelProfiles);
    // Legacy phase keys are what the pre-translation materializer wrote; the
    // next apply replaces them, so they are drift, not a broken contract.
    const legacy = keys.filter((k) => k.startsWith("sdd-"));
    const current = keys.filter((k) => !k.startsWith("sdd-"));
    for (const key of legacy.sort()) {
      report(`legacy phase key in model_profiles: ${key} (re-run apply-active-profile.mjs)`);
    }
    for (const key of current) {
      if (expectedAgents.has(key)) continue;
      if (fs.existsSync(path.join(agentsDir, `${key}.md`))) {
        report(`model_profiles key is not produced by the role translation: ${key}`);
      } else {
        fail(`model_profiles key has no installed agent: ${key}`);
      }
    }
    for (const agent of expectedAgents) {
      if (!Object.prototype.hasOwnProperty.call(modelProfiles, agent)) {
        report(`model_profiles is missing mapped agent: ${agent}`);
      }
    }
    console.log(
      `ok model_profiles: ${current.length} current key(s), ${legacy.length} legacy phase key(s)`,
    );
  }
} else {
  report(`missing ${subagentsPath} (run scripts/apply-active-profile.mjs)`);
}

if (failed) process.exit(1);

function readFrontmatter(file) {
  let content;
  try {
    content = fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
  if (!content.startsWith("---\n")) return null;
  const end = content.indexOf("\n---", 4);
  if (end === -1) return null;
  const out = {};
  for (const line of content.slice(4, end).split("\n")) {
    const m = /^(model|thinking|effort):\s*(.+?)\s*$/.exec(line);
    if (m) out[m[1]] = m[2];
  }
  return out;
}
