import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
export const dataDir =
  process.env.VELORA_DATA_DIR || join(homedir(), ".velora");
export async function readJson(name, fallback = {}) {
  try {
    return JSON.parse(await readFile(join(dataDir, name), "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return fallback;
    throw e;
  }
}
export async function writeJson(name, value) {
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const path = join(dataDir, name),
    tmp = path + "." + crypto.randomUUID() + ".tmp";
  await writeFile(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
  await rename(tmp, path);
}
export const settingKeys = [
  "velora-settings",
  "velora-custom-workouts-v1",
  "velora-preferences",
];
export function mergeRecords(current, incoming) {
  const merged = { ...current };
  for (const key of settingKeys) {
    const r = incoming?.[key];
    if (
      r &&
      typeof r.value === "string" &&
      r.value.length <= 500000 &&
      Number.isSafeInteger(r.updatedAt) &&
      r.updatedAt > 0 &&
      r.updatedAt <= Date.now() + 60000
    ) {
      JSON.parse(r.value);
      if (!current[key] || r.updatedAt > current[key].updatedAt)
        merged[key] = r;
    }
  }
  return merged;
}
