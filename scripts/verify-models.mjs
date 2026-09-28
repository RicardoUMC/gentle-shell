#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const [root, piAgentHome] = process.argv.slice(2);
if (!root || !piAgentHome) {
  console.error("usage: verify-models.mjs <repo-root> <pi-agent-home>");
  process.exit(1);
}

const storePath = path.join(piAgentHome, "models-store.json");
if (!fs.existsSync(storePath)) {
  console.error(`missing Pi model catalog: ${storePath}`);
  process.exit(1);
}

const store = JSON.parse(fs.readFileSync(storePath, "utf8"));
const files = [
  path.join(root, "profiles", "profiles.json"),
  path.join(root, "profiles", "models.json"),
  path.join(root, "profiles", "subagents.json"),
];

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

for (const file of files) visit(JSON.parse(fs.readFileSync(file, "utf8")));

let failed = false;
for (const model of [...models].sort()) {
  const slash = model.indexOf("/");
  if (slash <= 0 || slash === model.length - 1) {
    console.error(`invalid model id: ${model}`);
    failed = true;
    continue;
  }
  const provider = model.slice(0, slash);
  const id = model.slice(slash + 1);
  const providerModels = Array.isArray(store[provider]?.models) ? store[provider].models : [];
  const found = providerModels.some((entry) => entry?.id === id);
  if (!found) {
    console.error(`missing model: ${model}`);
    failed = true;
  } else {
    console.log(`ok model: ${model}`);
  }
}

if (failed) process.exit(1);
