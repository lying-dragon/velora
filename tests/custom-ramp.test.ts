import { test } from "node:test";
import assert from "node:assert/strict";
import { RampMeasurement } from "../src/ramp-test";
import { validateCustom, escapeHtml } from "../src/workout-editor";
import { parseHeartRate } from "../src/heart-rate";
import { StandingMotion } from "../src/rider-motion";
import { Rider } from "../src/world";
test("ramp FTP uses time-weighted measured 60 s, including partial final step", () => {
  const r = new RampMeasurement();
  for (let i = 0; i < 600; i++) r.add(200, 0.1);
  assert.equal(r.ftp, 150);
  for (let i = 0; i < 300; i++) r.add(300, 0.1);
  assert.ok(Math.abs(r.best - 250) < 1e-6);
  assert.equal(r.ftp, 188);
  r.add(0, 10);
  assert.equal(r.ftp, 188);
  r.invalidate("신호 끊김");
  assert.equal(r.eligible, false);
});
test("ramp rejects insufficient data, demo and out-of-range estimates", () => {
  const r = new RampMeasurement();
  r.add(500, 59);
  assert.equal(r.eligible, false);
  r.add(500, 1);
  assert.equal(r.eligible, true);
  r.invalidate("데모");
  assert.equal(r.eligible, false);
  const high = new RampMeasurement();
  high.add(1000, 60);
  assert.equal(high.eligible, false);
});
test("custom workout storage rejects malformed data and normalizes untrusted properties", () => {
  const w = validateCustom({
    name: "<img onerror=alert(1)>",
    steps: [
      { seconds: 90, factor: 0.75, label: "<script>", factorEnd: Infinity },
    ],
    source: "javascript:alert(1)",
  });
  assert.equal(w.steps[0].label, "단계 1");
  assert.equal(w.source, undefined);
  assert.equal(w.steps[0].factorEnd, undefined);
  assert.equal(escapeHtml(w.name), "&lt;img onerror=alert(1)&gt;");
  for (const seconds of [0, -1, NaN, Infinity, 1.5, 7201])
    assert.throws(() =>
      validateCustom({ name: "test", steps: [{ seconds, factor: 0.65 }] }),
    );
  assert.throws(() =>
    validateCustom({ name: "test", steps: [{ seconds: 60, factor: NaN }] }),
  );
  assert.throws(() =>
    validateCustom({
      name: "test",
      steps: Array(4).fill({ seconds: 7200, factor: 0.65 }),
    }),
  );
});
test("heart rate reads UINT8/UINT16 and rejects missing contact or truncated payloads", () => {
  const read = (...bytes: number[]) =>
    parseHeartRate(new DataView(Uint8Array.from(bytes).buffer));
  assert.equal(read(0, 153), 153);
  assert.equal(read(1, 4, 1), 260);
  assert.equal(read(6, 140), 140);
  assert.equal(read(4, 150), null);
  assert.equal(read(1, 140), null);
  assert.equal(read(0, 0), null);
  assert.equal(read(0), null);
});
test("standing motion requires sustained high torque, blends and returns to seated", () => {
  const motion = new StandingMotion();
  for (let i = 0; i < 60; i++) motion.update(0.05, 80, 45, 220);
  assert.equal(motion.blend, 0);
  for (let i = 0; i < 100; i++) motion.update(0.05, 300, 50, 220);
  assert.ok(motion.blend > 0.99);
  for (let i = 0; i < 100; i++) motion.update(0.05, 200, 90, 220);
  assert.ok(motion.blend < 0.01);
  const rider = new Rider(0xff5500);
  for (let i = 0; i < 100; i++) rider.animate(0.05, 50, 4, 300, 220);
  assert.ok(rider.body.position.y > 0.23);
  assert.ok(Math.abs(rider.bike.rotation.z) > 0.01);
  rider.group.traverse((o) => {
    assert.ok(Number.isFinite(o.position.x) && Number.isFinite(o.position.y));
  });
});
