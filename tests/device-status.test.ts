import { test } from "node:test";
import assert from "node:assert/strict";
import { deviceBadges, type DeviceSnapshot } from "../src/device-status";
const base: DeviceSnapshot = {
  demo: false,
  linked: true,
  name: "Test FTMS",
  kind: "trainer",
  fresh: true,
  hadReading: true,
  cadence: 0,
  trainerHeart: null,
  heartConnected: false,
  heartValue: null,
  heartName: "HR strap",
  canControl: true,
  controlError: false,
  controlStatus: "FTMS 승인",
};
test("zero cadence is a valid live reading, absent cadence is not a separate connected device", () => {
  assert.equal(
    deviceBadges(base).find((b) => b.id === "cadence")?.state,
    "live",
  );
  const unavailable = deviceBadges({ ...base, cadence: null }).find(
    (b) => b.id === "cadence",
  )!;
  assert.equal(unavailable.text, "미제공");
  assert.equal(unavailable.state, "off");
});
test("device health separates demo, searching, stale transport and disconnected devices", () => {
  assert.equal(deviceBadges({ ...base, demo: true })[0].state, "demo");
  assert.equal(
    deviceBadges({ ...base, fresh: false, hadReading: false })[0].state,
    "waiting",
  );
  assert.equal(deviceBadges({ ...base, fresh: false })[0].state, "stale");
  assert.equal(
    deviceBadges({ ...base, fresh: false, linked: false })[0].state,
    "off",
  );
});
test("independent heart strap overrides relayed HR, including missing contact", () => {
  const hr = (s: DeviceSnapshot) =>
    deviceBadges(s).find((b) => b.id === "heart")!;
  assert.equal(hr({ ...base, trainerHeart: 140 }).state, "live");
  assert.equal(
    hr({ ...base, trainerHeart: 140, heartConnected: true, heartValue: null })
      .state,
    "waiting",
  );
  assert.match(
    hr({ ...base, demo: true, heartConnected: true, heartValue: 130 }).detail,
    /HR strap/,
  );
});
test("power-only device never claims trainer control; errors stay visible", () => {
  const trainer = (s: DeviceSnapshot) =>
    deviceBadges(s).find((b) => b.id === "trainer")!;
  assert.equal(
    trainer({ ...base, kind: "power", canControl: false }).state,
    "off",
  );
  assert.equal(trainer({ ...base, controlError: true }).state, "error");
  assert.equal(trainer({ ...base, canControl: false }).text, "수신 전용");
});
