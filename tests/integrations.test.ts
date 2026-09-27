import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { activityText, activityTcx, type Activity } from "../src/activity";
import { mountainGeometry } from "../src/mountain";
const activity: Activity = {
  id: "test-ride-123",
  startedAt: Date.UTC(2026, 8, 26, 1),
  duration: 120,
  distance: 700,
  energy: 24,
  ascent: 3,
  ftp: 220,
  source: "ble",
  workout: "Z2 & <훈련>",
  route: "Coast",
  samples: [
    {
      seconds: 1,
      watts: 200,
      cadence: 85,
      heartRate: 150,
      distance: 5,
      speed: 18,
    },
    {
      seconds: 2,
      recordedAt: Date.UTC(2026, 8, 26, 1, 0, 12),
      watts: 210,
      cadence: null,
      heartRate: null,
      distance: 10,
      speed: 18,
    },
  ],
};
test("TCX preserves measured power/cadence/heart rate, actual timestamps and excludes fabricated GPS", () => {
  const tcx = activityTcx(activity);
  assert.match(tcx, /<ae:Watts>200<\/ae:Watts>/);
  assert.match(tcx, /<Value>150<\/Value>/);
  assert.match(tcx, /2026-09-26T01:00:12.000Z/);
  assert.doesNotMatch(tcx, /<Position>/);
  assert.match(tcx, /Z2 &amp; &lt;훈련&gt;/);
  assert.match(tcx, /<TotalTimeSeconds>120.00/);
  assert.match(activityText(activity).description, /평균 200 W/);
  assert.match(activityText({ ...activity, source: "demo" }).title, /DEMO/);
});
test("snow line is a disjoint triangulation, not overlapping cones", () => {
  const geometry = mountainGeometry(200, 300, true),
    p = geometry.getAttribute("position"),
    colors = geometry.getAttribute("color");
  assert.equal(p.count, 45);
  const triangles = new Set();
  let snowArea = 0,
    rockArea = 0;
  for (let i = 0; i < p.count; i += 3) {
    const vertices = [0, 1, 2].map((j) => [
      p.getX(i + j),
      p.getY(i + j),
      p.getZ(i + j),
    ]);
    const key = vertices
      .map((v) => v.join(","))
      .sort()
      .join("|");
    assert.equal(triangles.has(key), false);
    triangles.add(key);
    const ys = vertices.map((v) => v[1]);
    if (colors.getX(i) > 0.8) {
      assert.ok(Math.min(...ys) >= 60 - 1e-5);
      snowArea++;
    } else {
      assert.ok(Math.max(...ys) <= 60 + 1e-5);
      rockArea++;
    }
  }
  assert.equal(snowArea, 5);
  assert.equal(rockArea, 10);
  geometry.dispose();
});
test("disk settings survive reads; ride validation rejects invalid identifiers", async () => {
  const dir = await mkdtemp(join(tmpdir(), "velora-tests-"));
  process.env.VELORA_DATA_DIR = dir;
  try {
    const { readJson, writeJson, mergeRecords } =
      await import("../services/store.mjs");
    const { validateRide } = await import("../services/ride-validation.mjs");
    const now = Date.now();
    const merged = mergeRecords(
      { "velora-settings": { value: '{"ftp":220}', updatedAt: now } },
      {
        "velora-settings": { value: '{"ftp":240}', updatedAt: now - 1 },
        evil: { value: "{}", updatedAt: now },
      },
    );
    assert.equal(JSON.parse(merged["velora-settings"].value).ftp, 220);
    assert.equal(merged.evil, undefined);
    await writeJson("settings.json", merged);
    assert.deepEqual(await readJson("settings.json"), merged);
    assert.equal((await stat(join(dir, "settings.json"))).mode & 0o777, 0o600);
    const ride = {
      id: activity.id,
      ...activityText(activity),
      tcx: activityTcx(activity),
      png: "data:image/png;base64,YQ==",
      source: "ble",
      duration: 120,
    };
    validateRide(ride);
    assert.throws(() => validateRide({ ...ride, id: "../../file" }));
  } finally {
    delete process.env.VELORA_DATA_DIR;
    await rm(dir, { recursive: true, force: true });
  }
});

test("companion rejects foreign origins, survives restart and deduplicates ride submission", async () => {
  const { spawn } = await import("node:child_process");
  const { createServer } = await import("node:net");
  const dir = await mkdtemp(join(tmpdir(), "velora-server-"));
  const reserve = createServer();
  await new Promise<void>((resolve) => reserve.listen(0, "127.0.0.1", resolve));
  const port = (reserve.address() as any).port;
  await new Promise<void>((resolve) => reserve.close(() => resolve()));
  let child: any;
  const url = `http://127.0.0.1:${port}`;
  const headers = {
    Origin: "http://127.0.0.1:5173",
    "Content-Type": "application/json",
  };
  const launch = async () => {
    child = spawn(process.execPath, ["services/server.mjs"], {
      env: {
        ...process.env,
        VELORA_DATA_DIR: dir,
        VELORA_SERVICE_PORT: String(port),
      },
      stdio: "pipe",
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(Error("server startup timeout")),
        5000,
      );
      child.stdout.once("data", () => {
        clearTimeout(timer);
        resolve();
      });
      child.once("error", reject);
    });
  };
  const stop = async () => {
    if (child && child.exitCode === null) {
      const exited = new Promise<void>((resolve) =>
        child.once("exit", () => resolve()),
      );
      child.kill("SIGTERM");
      await exited;
    }
  };
  try {
    await launch();
    assert.equal(
      (
        await fetch(url + "/status", {
          headers: { Origin: "https://foreign.example" },
        })
      ).status,
      403,
    );
    const record = {
      "velora-settings": {
        value: '{"ftp":271,"weight":70}',
        updatedAt: Date.now(),
      },
    };
    assert.equal(
      (
        await fetch(url + "/settings", {
          method: "PUT",
          headers,
          body: JSON.stringify(record),
        })
      ).status,
      200,
    );
    const ride = {
      id: "test-durable-ride",
      ...activityText(activity),
      tcx: activityTcx(activity),
      png: "data:image/png;base64,YQ==",
      source: "demo",
      duration: 120,
    };
    for (let i = 0; i < 2; i++)
      assert.equal(
        (
          await fetch(url + "/rides", {
            method: "POST",
            headers,
            body: JSON.stringify(ride),
          })
        ).status,
        200,
      );
    assert.equal(
      (await fetch(url + "/strava/callback?state=forged&code=fake")).status,
      403,
    );
    assert.equal(
      (await fetch(url + "/strava/callback", { headers })).status,
      410,
    );
    await stop();
    await launch();
    assert.deepEqual(
      await (await fetch(url + "/settings", { headers })).json(),
      record,
    );
    const state = await (await fetch(url + "/status", { headers })).json();
    assert.equal(state.rides.length, 1);
    assert.equal(state.rides[0].state, "local");
    assert.equal(state.transport, "browser-ui");
    assert.equal(state.clientSecret, undefined);
  } finally {
    await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
