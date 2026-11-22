#!/usr/bin/env node
// Checks the API definitions in scripts/public-apis/ against the real APIs and
// records real example responses, so the docs never show invented data.
//
// For every GET operation it:
//   1. calls the real backend (x-opengate.backend) with the path parameters'
//      examples and the query parameters that are required or have an example,
//   2. stores the (trimmed) response as the success response's example,
//   3. calls it again once per remaining optional query parameter, with that
//      parameter's example or default, to check the API accepts it.
// Anything that doesn't answer 2xx is reported, and the script exits 1.
// Other methods (e.g. POST) are left as written: calling them could change data.
//
// Usage: node scripts/record-examples.mjs [file.json ...]   (default: all)
// Then:  scripts/seed-public-apis.sh   to upload the updated docs to WSO2.

import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "public-apis");
const MAX_ARRAY_ITEMS = 2;
const MAX_STRING = 160;
const MAX_KEYS = 20;
const MAX_DEPTH = 5;
const TIMEOUT_MS = 20_000;

/** Shrinks a response to something readable in the docs, keeping its shape. */
function trim(value, depth = 0) {
  if (typeof value === "string") {
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  }
  if (Array.isArray(value)) {
    if (depth >= MAX_DEPTH) return [];
    return value.slice(0, MAX_ARRAY_ITEMS).map((v) => trim(v, depth + 1));
  }
  if (value && typeof value === "object") {
    if (depth >= MAX_DEPTH) return {};
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, MAX_KEYS)
        .map(([k, v]) => [k, trim(v, depth + 1)]),
    );
  }
  return value;
}

/**
 * The value to call with. "x-test-value" is for optional parameters that have
 * no example and no real default: it's only used here, never shown in the docs.
 */
function sample(param) {
  const schema = param.schema ?? {};
  return (
    param.example ?? schema.example ?? param["x-test-value"] ?? schema.default ?? schema.enum?.[0]
  );
}

function buildUrl(backend, pathTemplate, params, extra = {}) {
  let urlPath = pathTemplate;
  const query = new URLSearchParams();
  for (const p of params) {
    if (p.in === "path") {
      const value = sample(p);
      if (value === undefined) throw new Error(`path parameter "${p.name}" has no example`);
      urlPath = urlPath.replace(`{${p.name}}`, encodeURIComponent(String(value)));
    } else if (p.in === "query" && (p.required || p.example !== undefined)) {
      const value = sample(p);
      if (value === undefined) throw new Error(`required parameter "${p.name}" has no example`);
      query.set(p.name, String(value));
    }
  }
  for (const [k, v] of Object.entries(extra)) query.set(k, String(v));
  const qs = query.toString();
  return backend.replace(/\/$/, "") + (urlPath === "/" ? "/" : urlPath) + (qs ? `?${qs}` : "");
}

async function call(url) {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "OpenGate-docs-recorder" },
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = undefined;
  }
  return { status: res.status, body };
}

async function recordFile(file) {
  const doc = JSON.parse(await readFile(file, "utf8"));
  const backend = doc["x-opengate"]?.backend;
  const name = doc.info?.title ?? path.basename(file);
  if (!backend) return [`${name}: no x-opengate.backend`];
  const problems = [];
  console.log(`${name}`);

  for (const [pathTemplate, item] of Object.entries(doc.paths ?? {})) {
    const op = item.get;
    if (!op) continue;
    const params = [...(item.parameters ?? []), ...(op.parameters ?? [])];
    const label = `GET ${pathTemplate}`;

    let url;
    try {
      url = buildUrl(backend, pathTemplate, params);
    } catch (err) {
      problems.push(`${name} ${label}: ${err.message}`);
      continue;
    }
    const { status, body } = await call(url);
    if (status < 200 || status >= 300 || body === undefined) {
      problems.push(`${name} ${label}: ${url} → ${status}${body === undefined ? " (not JSON)" : ""}`);
      continue;
    }
    op.responses ??= {};
    const code = String(status);
    const response = (op.responses[code] ??= { description: "OK" });
    response.content = { "application/json": { example: trim(body) } };
    console.log(`  ${label} → ${status}, example recorded`);

    for (const p of params) {
      if (p.in !== "query" || p.required || p.example !== undefined) continue;
      const value = sample(p);
      if (value === undefined) {
        problems.push(
          `${name} ${label}: optional "${p.name}" has no example, default or x-test-value, so it's untested`,
        );
        continue;
      }
      const check = await call(buildUrl(backend, pathTemplate, params, { [p.name]: value }));
      if (check.status < 200 || check.status >= 300) {
        problems.push(`${name} ${label}: ${p.name}=${value} → ${check.status}`);
      } else {
        console.log(`    ${p.name}=${value} → ${check.status}`);
      }
    }
  }

  await writeFile(file, `${JSON.stringify(doc, null, 2)}\n`);
  return problems;
}

const args = process.argv.slice(2);
const files = args.length
  ? args.map((f) => path.resolve(f))
  : (await readdir(API_DIR)).filter((f) => f.endsWith(".json")).sort().map((f) => path.join(API_DIR, f));

const problems = [];
for (const file of files) problems.push(...(await recordFile(file)));

if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log("\nAll documented GET endpoints and parameters answered 2xx.");
