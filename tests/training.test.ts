import { test } from "node:test";
import assert from "node:assert/strict";
import { equilibriumSpeed, nextSpeed, requiredPower } from "../src/physics.ts";
import { Course } from "../src/world.ts";
import {
  workouts,
  workoutStep,
  workoutDuration,
  workoutMetrics,
} from "../src/workouts.ts";
import {
  fecPacket,
  fecUser,
  ftmsPacket,
  chooseTarget,
  validateTarget,
  TrainerControl,
  type TrainerTarget,
} from "../src/trainer-control.ts";
import { applyControl, validateControl } from "../bridge/control.mjs";
test("5% climb at 200 W has a realistic steady speed; 50 km/h requires >1100 W", () => {
  const equilibrium = equilibriumSpeed(200, 83, 0.05) * 3.6;
  assert.ok(equilibrium > 14 && equilibrium < 16);
  assert.ok(requiredPower(50 / 3.6, 83, 0.05) > 1100);
  let v = 50 / 3.6;
  for (let i = 0; i < 600; i++) v = nextSpeed(v, 200, 83, 0.05, 0.1);
  assert.ok(v * 3.6 < 17);
  assert.equal(nextSpeed(NaN, 200, 83, 0.05, 0.1), 0);
});
test("integration is stable across frame sizes and coasting preserves physical inertia", () => {
  let a = 0,
    b = 0;
  for (let i = 0; i < 600; i++) a = nextSpeed(a, 250, 83, 0.05, 0.1);
  for (let i = 0; i < 3600; i++) b = nextSpeed(b, 250, 83, 0.05, 1 / 60);
  assert.ok(Math.abs(a - b) < 0.01);
  assert.ok(nextSpeed(10, 0, 83, 0, 0.1) < 10);
  assert.ok(nextSpeed(10, 0, 83, -0.08, 0.1) > 10);
});
test("alpine route simulation regression: 165 W cannot carry 50 km/h through a 5% climb", () => {
  const course = new Course("alpine");
  let v = 0,
    d = 0,
    max = 0,
    sawClimb = false;
  for (let i = 0; i < 12000; i++) {
    const grade = course.grade(d);
    v = nextSpeed(v, 165, 83, grade, 0.1, course.cornerLimit(d));
    d += v * 0.1;
    if (grade > 0.045) {
      sawClimb = true;
      max = Math.max(max, v * 3.6);
    }
  }
  assert.ok(sawClimb);
  assert.ok(max < 30);
});
test("Flux programs keep exact durations, ramps, repeats, and next-step transitions", () => {
  assert.equal(workoutDuration("lsd"), 5400);
  assert.equal(workoutDuration("intervals"), 4800);
  assert.equal(workoutDuration("vo2"), 3420);
  assert.equal(
    workouts.intervals.steps.filter((s) => s.factor === 0.92).length,
    4,
  );
  assert.equal(workoutStep("endurance", 150)?.factor, 0.5);
  assert.equal(workoutStep("endurance", 300)?.factor, 0.67);
  assert.equal(workoutStep("endurance", 300)?.next?.label, "쿨다운");
  assert.equal(workoutStep("lsd", 5400), null);
  assert.ok(workoutMetrics("lsd").tss > 40);
});
test("control precedence: ERG ignores grade; paused/stale/stopped/disabled releases", () => {
  const args = {
    running: true,
    fresh: true,
    pedaling: true,
    training: true,
    targetWatts: 180,
    grade: 8,
    weight: 75,
    enabled: true,
  };
  assert.deepEqual(chooseTarget(args), { mode: "erg", watts: 180, weight: 75 });
  assert.deepEqual(chooseTarget({ ...args, training: false }), {
    mode: "sim",
    grade: 8,
    weight: 75,
  });
  for (const key of ["running", "fresh", "pedaling", "enabled"])
    assert.deepEqual(chooseTarget({ ...args, [key]: false }), {
      mode: "release",
    });
});
test("FE-C and FTMS outgoing bytes use correct W, signed grade, and release encodings", () => {
  assert.deepEqual(
    [...fecPacket({ mode: "erg", watts: 250, weight: 75 })],
    [49, 255, 255, 255, 255, 255, 232, 3],
  );
  assert.deepEqual(
    [...fecPacket({ mode: "sim", grade: 5, weight: 75 })],
    [51, 255, 255, 255, 255, 20, 80, 80],
  );
  assert.deepEqual(
    [...ftmsPacket({ mode: "sim", grade: -5, weight: 75 })],
    [17, 0, 0, 12, 254, 40, 39],
  );
  assert.equal(fecPacket({ mode: "release" })[7], 0);
  assert.deepEqual([...ftmsPacket({ mode: "release" })], [8, 1]);
  assert.equal(fecUser(75)[6], 70);
  assert.throws(() =>
    validateTarget({ mode: "erg", watts: Infinity, weight: 75 }),
  );
  assert.throws(() => validateControl({ mode: "sim", grade: 21, weight: 75 }));
});
test("release supersedes a queued load while a command is in flight", async () => {
  const sent: TrainerTarget[] = [];
  let resolve: ((s: string) => void) | undefined;
  const c = new TrainerControl(
    (t) => {
      sent.push(t);
      return sent.length === 1
        ? new Promise((r) => (resolve = r))
        : Promise.resolve("ok");
    },
    () => {},
  );
  c.update({ mode: "erg", watts: 200, weight: 75 }, 10000);
  c.update({ mode: "erg", watts: 300, weight: 75 }, 11000);
  const stop = c.release();
  resolve!("ok");
  await stop;
  assert.deepEqual(
    sent.map((t) => t.mode),
    ["erg", "release"],
  );
});
test("bridge dispatch uses user config, wind, signed grade; ERG mode does not send slope", async () => {
  const calls: any[] = [];
  const sensor = new Proxy(
    {},
    {
      get:
        (_t, key) =>
        (...args: any[]) => {
          const callback = args.pop();
          calls.push([key, ...args]);
          callback(true);
        },
    },
  );
  await applyControl(sensor, { mode: "sim", grade: -3, weight: 75 });
  assert.ok(calls.some((c) => c[0] === "setTrackResistance" && c[1] === -3));
  calls.length = 0;
  await applyControl(sensor, { mode: "erg", watts: 220, weight: 75 });
  assert.ok(calls.some((c) => c[0] === "setTargetPower" && c[1] === 220));
  assert.ok(!calls.some((c) => c[0] === "setTrackResistance"));
  await applyControl(sensor, { mode: "release" });
  assert.deepEqual(calls.at(-1), ["setBasicResistance", 0]);
});

test("a stalled release is not requeued by periodic updates and source switch can finish", async () => {
  let rejectSend: ((e: Error) => void) | undefined;
  let calls = 0;
  const c = new TrainerControl(
    () => {
      calls++;
      return new Promise((_resolve, reject) => (rejectSend = reject));
    },
    () => {},
  );
  const release = c.release();
  c.update({ mode: "release" }, 10000);
  c.update({ mode: "release" }, 11000);
  rejectSend!(new Error("timeout"));
  await release;
  assert.equal(calls, 1);
});
test("control errors remain visible after fallback release succeeds", async () => {
  const messages: string[] = [];
  const c = new TrainerControl(
    async (target) => {
      if (target.mode !== "release") throw new Error("unsupported");
      return "released";
    },
    (s) => messages.push(s),
  );
  c.update({ mode: "erg", watts: 200, weight: 75 }, 10000);
  await new Promise((r) => setTimeout(r, 0));
  assert.match(messages.at(-1)!, /unsupported.*released/);
});
