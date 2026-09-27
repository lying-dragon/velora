import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { StravaUi } = require("../desktop/strava-ui.cjs");
test("uncertain Strava transmission remains blocked across repeated retries", async () => {
  const adapter = new StravaUi();
  adapter.open = () => {
    throw Error("must not open or retransmit");
  };
  let ride: any = { state: "needs_review", source: "ble", duration: 60 };
  for (let i = 0; i < 2; i++) {
    const result = await adapter.upload(ride, async (update: any) => {
      ride = { ...ride, ...update };
    });
    assert.equal(result.state, "needs_review");
    assert.match(result.message, /재업로드하지/);
  }
});
test("completed activities are not reuploaded and demo never transmits", async () => {
  const adapter = new StravaUi();
  let reports = 0;
  adapter.open = () => {
    throw Error("must not open or transmit");
  };
  const complete = await adapter.upload(
    { state: "complete", activityId: "123" },
    async () => reports++,
  );
  assert.equal(complete.activityId, "123");
  assert.equal(reports, 0);
  const demo = await adapter.upload(
    { state: "local", source: "demo", duration: 60 },
    async () => reports++,
  );
  assert.match(demo.message, /데모/);
  assert.equal(reports, 1);
});
