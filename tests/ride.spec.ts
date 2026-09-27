import { isolateCompanion } from "./service-mock";
import { test, expect } from "@playwright/test";
test("ride, power, pause, settings, route, workout and CSV export", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator("#world canvas")).toBeVisible();
  await page.screenshot({ path: "docs/velora-desktop.png" });
  await page.locator("#demo-power").fill("300");
  await expect(page.locator("#watts")).toHaveText("300");
  await page.locator("#start").click();
  await expect(page.locator("#start")).toContainText("일시정지");
  await expect
    .poll(async () => Number(await page.locator("#speed").textContent()))
    .toBeGreaterThan(1);
  await page.waitForTimeout(1300);
  await page.locator("#start").click();
  const time = await page.locator("#time").textContent();
  await page.waitForTimeout(1100);
  await expect(page.locator("#time")).toHaveText(time!);
  await page.locator("#settings-open").click();
  await page.locator("#weight-input").fill("60");
  await page.locator("#ftp-input").fill("250");
  await page.getByRole("button", { name: "설정 저장" }).click();
  await expect(page.locator("#wkg")).toHaveText("5.00");
  await page.locator("#finish").click();
  const downloaded = page.waitForEvent("download");
  await page.locator("#export").click();
  expect((await downloaded).suggestedFilename()).toMatch(/velora-demo.*csv/);
  await page.locator("#new-ride").click();
  await page.locator("#routes-open").click();
  await page.locator('[data-route="alpine"]').click();
  await expect(page.locator("#location-name")).toHaveText("ALPINE LOOP");
  await page.locator("#workout-open").click();
  await page.locator('[data-plan="intervals"]').click();
  await page.locator("#apply-plan").click();
  await expect(page.locator("#target")).toHaveText("80 W 목표");
  await page.locator("#connect-top").click();
  await page.locator("#choose-ant").click();
  await expect(page.locator("#connection-status")).toContainText(/브리지|동글/);
  await page.locator("#choose-demo").click();
  await expect(page.locator("#source-label")).toHaveText("데모 모드");
  expect(errors).toEqual([]);
});
test("mobile layout has no horizontal overflow and working controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("#start")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page.screenshot({ path: "docs/velora-mobile.png" });
  await page.locator("#connect-top").click();
  await expect(page.locator("#choose-serial")).toBeVisible();
  await page.locator("#modal-close").click();
  await page.locator("#start").click();
  await expect(page.locator("#start")).toContainText("일시정지");
});
test("WebANT USB command handshakes, power input and stale signal reset", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let resolveRead: ((v: any) => void) | undefined;
    const queue: any[] = [];
    let emit: any;
    const frame = (id: number, data: number[]) => {
      const a = [164, data.length, id, ...data];
      return new Uint8Array([...a, a.reduce((x, y) => x ^ y, 0)]);
    };
    const push = (bytes: Uint8Array) => {
      const result = { status: "ok", data: new DataView(bytes.buffer) };
      if (resolveRead) {
        const r = resolveRead;
        resolveRead = undefined;
        r(result);
      } else queue.push(result);
    };
    const alt = {
      alternateSetting: 0,
      endpoints: [
        { direction: "in", type: "bulk", endpointNumber: 1, packetSize: 64 },
        { direction: "out", type: "bulk", endpointNumber: 1, packetSize: 64 },
      ],
    };
    const device = {
      configuration: {
        interfaces: [{ interfaceNumber: 0, alternates: [alt] }],
      },
      open: async () => {},
      claimInterface: async () => {},
      selectAlternateInterface: async () => {},
      close: async () => {
        clearInterval(emit);
      },
      transferIn: async () =>
        queue.shift() ||
        new Promise((r) => {
          resolveRead = r;
        }),
      transferOut: async (_ep: number, bytes: Uint8Array) => {
        const id = bytes[2];
        push(id === 0x4a ? frame(0x6f, [0]) : frame(0x40, [0, id, 0]));
        if (id === 0x4f) push(frame(0x40, [0, 1, 5]));
        if (id === 0x4b) {
          emit = setInterval(
            () => push(frame(0x4e, [0, 25, 1, 90, 0, 0, 240, 0, 0])),
            100,
          );
          setTimeout(() => clearInterval(emit), 1800);
        }
        return { status: "ok" };
      },
    };
    Object.defineProperty(navigator, "usb", {
      value: { requestDevice: async () => device },
      configurable: true,
    });
  });
  await page.goto("/");
  await page.locator("#connect-top").click();
  await page.locator("#choose-serial").click();
  await expect(page.locator("#connection-status")).toContainText("수신 중");
  await page.locator("#modal-close").click();
  await expect(page.locator("#watts")).toHaveText("240");
  await expect(page.locator("#cadence")).toHaveText("90");
  await page.locator("#start").click();
  await expect
    .poll(async () => Number(await page.locator("#speed").textContent()))
    .toBeGreaterThan(0);
  await expect(page.locator("#watts")).toHaveText("0", { timeout: 7000 });
  await expect(page.locator("#sensor-name")).toContainText("신호가 없습니다");
});

test.beforeEach(async ({page}) => { await isolateCompanion(page); });
