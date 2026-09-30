import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseKaikki } from "../shared/kaikki";
import type { Entry } from "../shared/types";

/** Real kaikki.org responses, saved in test/fixtures so tests run offline. */
export function fixture(name: string): string {
  return readFileSync(resolve(import.meta.dirname, "../../test/fixtures", `${name}.jsonl`), "utf8");
}

export function entry(name: string, pos: string): Entry {
  const found = parseKaikki(fixture(name)).find((e) => e.pos === pos);
  if (!found) throw new Error(`fixture ${name} has no ${pos} entry`);
  return found;
}
