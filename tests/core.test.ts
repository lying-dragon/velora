import { test } from "node:test";
import assert from "node:assert/strict";
import { nextSpeed, workoutStep, workouts, zone } from "../src/physics.ts";
import {
  AntFramer,
  antFrame,
  decodeAntPayload,
  channelCommands,
} from "../src/ant-protocol.ts";
import { parseIndoorBike, parseCyclingPower } from "../src/sensors.ts";
const steady = (w: number, grade = 0, mass = 83) => {
  let speed = 0;
  for (let t = 0; t < 6000; t++) speed = nextSpeed(speed, w, mass, grade, 0.05);
  return speed;
};
test("power, gradient and weight influence physical speed", () => {
  assert.ok(steady(250) > steady(100));
  assert.ok(steady(200, 0.05) < steady(200, 0));
  assert.ok(steady(200, 0.05, 105) < steady(200, 0.05, 70));
  assert.equal(steady(0), 0);
  assert.ok(nextSpeed(10, 0, 83, 0, 1) < 10);
  assert.equal(nextSpeed(0, 0, 83, 0.1, 1), 0);
});
test("workout boundary transitions and total duration", () => {
  assert.equal(workoutStep("endurance", 299)?.label, "워밍업");
  assert.equal(workoutStep("endurance", 300)?.label, "Z2 지구력");
  assert.equal(workoutStep("endurance", 1800), null);
  assert.equal(
    workouts.intervals.steps.reduce((n, s) => n + s.seconds, 0),
    4800,
  );
  assert.equal(zone(0, 220), 1);
  assert.equal(zone(165, 220), 2);
});
test("ANT framing handles partial chunks, concatenated frames, invalid checksum and garbage", () => {
  const a = antFrame(0x4e, [0, 25, 1, 80, 0, 0, 200, 0, 0]);
  const b = antFrame(0x40, [0, 0x4b, 0]);
  const framer = new AntFramer();
  assert.deepEqual(framer.push(a.slice(0, 5)), []);
  assert.deepEqual(framer.push(new Uint8Array([...a.slice(5), ...b])), [a, b]);
  const bad = a.slice();
  bad[5] ^= 1;
  assert.deepEqual(framer.push(new Uint8Array([99, 3, ...bad, ...b])), [b]);
});
test("WebANT FE-C decoding, sentinel filtering and Bicycle Power", () => {
  assert.deepEqual(
    decodeAntPayload("fec", new Uint8Array([25, 1, 88, 0, 0, 0x2c, 0x11, 0])),
    { watts: 300, cadence: 88 },
  );
  assert.deepEqual(
    decodeAntPayload("fec", new Uint8Array([25, 1, 255, 0, 0, 255, 15, 0])),
    { watts: undefined, cadence: null },
  );
  assert.equal(decodeAntPayload("fec", new Uint8Array([25])), null);
  assert.deepEqual(
    decodeAntPayload("power", new Uint8Array([16, 1, 255, 90, 0, 0, 200, 0])),
    { watts: 200, cadence: 90 },
  );
  assert.equal(channelCommands("fec", 123)[2][1][3], 17);
});
test("BLE FTMS optional offsets and malformed packets", () => {
  const bytes = new Uint8Array([0x64, 0x02, 0, 0, 180, 0, 10, 0, 250, 0, 145]);
  const d = parseIndoorBike(new DataView(bytes.buffer));
  assert.deepEqual(d, { watts: 250, cadence: 90, heartRate: 145 });
  assert.equal(parseIndoorBike(new DataView(bytes.buffer, 0, 5)), null);
  assert.equal(
    parseCyclingPower(new DataView(new Uint8Array([0, 0, 200, 0]).buffer))
      .watts,
    200,
  );
});
