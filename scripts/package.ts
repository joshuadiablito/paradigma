// Builds a Chrome Web Store upload: paradigma-<version>.zip, with
// manifest.json at the root of the zip as the store requires.
//
//   bun run package

import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { extname, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as { version: string };
const manifest = JSON.parse(readFileSync(resolve(root, "public/manifest.json"), "utf8")) as { version: string };

if (pkg.version !== manifest.version) {
  console.error(`Version mismatch: package.json has ${pkg.version}, public/manifest.json has ${manifest.version}.`);
  process.exit(1);
}

function run(cmd: string[], cwd = root): void {
  console.log(`$ ${cmd.join(" ")}`);
  const { exitCode } = Bun.spawnSync(cmd, { cwd, stdout: "inherit", stderr: "inherit" });
  if (exitCode !== 0) process.exit(exitCode ?? 1);
}

run(["bun", "run", "check"]); // typecheck, tests, production build

// The package is what users install: only what the extension runs. No
// source maps, sources, docs, tests or fixtures, which belong in the repository.
const dist = resolve(root, "dist");
const SHIPPED = new Set([".js", ".css", ".html", ".json", ".png"]);
const files = readdirSync(dist, { recursive: true, withFileTypes: true })
  .filter((f) => f.isFile() && f.name !== ".DS_Store")
  .map((f) => relative(dist, resolve(f.parentPath, f.name)));
const problems = [
  ...files.filter((f) => !SHIPPED.has(extname(f))).map((f) => `${f}: not part of the extension`),
  ...files.filter((f) => [".js", ".css"].includes(extname(f)) && readFileSync(resolve(dist, f), "utf8").includes("sourceMappingURL"))
    .map((f) => `${f}: refers to a source map (was this a development build?)`),
];
if (problems.length > 0) {
  console.error(`dist/ holds files that mustn't be shipped:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}

const zip = resolve(root, `paradigma-${pkg.version}.zip`);
if (existsSync(zip)) rmSync(zip);
run(["zip", "-r", "-X", "-q", zip, ".", "-x", ".DS_Store"], dist);
console.log(`\nReady to upload: ${zip}`);
