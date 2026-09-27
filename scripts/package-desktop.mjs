import { packager } from "@electron/packager";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
import { mkdtemp, cp, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const staging = await mkdtemp(join(tmpdir(), "velora-package-"));
try {
  for (const dir of ["dist", "desktop", "services"])
    await cp(dir, join(staging, dir), { recursive: true });
  await cp("LICENSE", join(staging, "LICENSE"));
  await cp("README.md", join(staging, "README.md"));
  await writeFile(
    join(staging, "package.json"),
    JSON.stringify({
      name: "velora",
      productName: "VELORA",
      version: "0.2.0",
      main: "desktop/main.cjs",
      license: "AGPL-3.0",
    }),
  );
  const built = await packager({
    electronVersion: require("electron/package.json").version,
    dir: staging,
    name: "VELORA",
    platform: process.platform,
    arch: process.arch,
    out: "release",
    overwrite: true,
    asar: false,
    appBundleId: "local.velora.cycling",
    appCategoryType: "public.app-category.healthcare-fitness",
    icon: "public/velora.icns",
    extendInfo: {
      NSBluetoothAlwaysUsageDescription:
        "스마트로라와 심박계의 파워·케이던스·심박 정보를 연결합니다.",
      NSBluetoothPeripheralUsageDescription:
        "스마트로라와 심박계를 연결합니다.",
    },
  });
  console.log(built.join("\n"));
} finally {
  await rm(staging, { recursive: true, force: true });
}
