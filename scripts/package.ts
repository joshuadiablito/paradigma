// Builds a Chrome Web Store upload: lekseis-hover-<version>.zip, with
// manifest.json at the root of the zip as the store requires.
//
//   bun run package

import { existsSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";

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

const zip = resolve(root, `lekseis-hover-${pkg.version}.zip`);
if (existsSync(zip)) rmSync(zip);
run(["zip", "-r", "-X", "-q", zip, ".", "-x", "*.map", "-x", ".DS_Store"], resolve(root, "dist"));
console.log(`\nReady to upload: ${zip}`);
