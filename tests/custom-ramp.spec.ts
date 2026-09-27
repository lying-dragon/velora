import { isolateCompanion } from "./service-mock";
import { test, expect } from "@playwright/test";
test("create, drag reorder, edit and reload a custom workout", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#training-open").click();
  await page.locator("#create-workout").click();
  await page.locator("#editor-name").fill("내 3단계 훈련");
  await page.locator("[data-factor]").fill("50");
  await page.locator("[data-seconds]").fill("120");
  await page.locator("#add-step").click();
  await page.locator("[data-factor]").nth(1).fill("120");
  await page.locator("[data-seconds]").nth(1).fill("60");
  await page.locator("#add-step").click();
  await page.locator("[data-factor]").nth(2).fill("70");
  await page
    .locator("[data-handle]")
    .nth(2)
    .dragTo(page.locator(".editor-step").nth(0));
  await expect(page.locator("[data-factor]").nth(0)).toHaveValue("70");
  await page
    .getByRole("button", { name: "라이브러리에 저장", exact: true })
    .click();
  const selected = page.locator(".training-tile.selected");
  await expect(selected).toContainText("내 3단계 훈련");
  const key = await selected.getAttribute("data-plan");
  await page.locator("#edit-workout").click();
  await page.locator("[data-up]").nth(1).click();
  await expect(page.locator("[data-factor]").nth(0)).toHaveValue("50");
  await page.locator("#editor-name").fill("수정된 훈련");
  await page
    .getByRole("button", { name: "라이브러리에 저장", exact: true })
    .click();
  await page.locator("#apply-plan").click();
  await expect(page.locator("#training-power")).toHaveText("110 W");
  await page.reload();
  await page.locator("#training-open").click();
  await page.locator(`[data-plan="${key}"]`).click();
  await expect(page.locator("#plan-detail")).toContainText("수정된 훈련");
  await page.locator("#edit-workout").click();
  await page.screenshot({ path: "docs/workout-editor.png" });
});
test("ramp test exposes protocol, locks intensity and prevents applying demo FTP", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#training-open").click();
  await page.locator('[data-plan="ramp"]').click();
  await expect(page.locator(".ramp-guide")).toContainText("60초");
  await page.locator("#apply-plan").click();
  await expect(page.locator("#training-power")).toHaveText("101 W");
  await expect(page.locator("#skip-step")).toBeDisabled();
  await expect(page.locator("#intensity-up")).toBeDisabled();
  await page.locator("#start").click();
  await page.locator("#finish").click();
  await expect(page.locator(".ramp-result")).toContainText("데모 결과");
  await expect(page.locator("#apply-ftp")).toBeDisabled();
  await expect(page.locator("#ramp-exhausted")).toBeDisabled();
});
test("training dock never intersects 3D canvas at desktop, phone and landscape sizes", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#training-open").click();
  await page.locator('[data-plan="endurance"]').click();
  await page.locator("#apply-plan").click();
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(250);
    const world = await page.locator("#world").boundingBox(),
      hud = await page.locator("#training-hud").boundingBox();
    expect(world && hud).toBeTruthy();
    expect(
      world!.y + world!.height <= hud!.y + 1 ||
        world!.x + world!.width <= hud!.x + 1,
    ).toBeTruthy();
    const control = await page.locator("#control-badge").boundingBox();
    expect(control!.height).toBeLessThan(65);
    const start = await page.locator("#start").boundingBox();
    expect(start!.y + start!.height).toBeLessThanOrEqual(viewport.height);
    await page.screenshot({ path: `docs/training-dock-${viewport.width}.png` });
  }
});
test("independent Bluetooth heart rate notifications, staleness and disconnect", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const characteristic = new EventTarget() as any;
    characteristic.startNotifications = async () => characteristic;
    const device = new EventTarget() as any;
    device.gatt = {
      connect: async () => ({
        getPrimaryService: async () => ({
          getCharacteristic: async () => characteristic,
        }),
      }),
      disconnect: () => {},
    };
    Object.defineProperty(navigator, "bluetooth", {
      configurable: true,
      value: {
        requestDevice: async (options: any) => {
          if (options.filters[0].services[0] !== "heart_rate")
            throw Error("wrong profile");
          return device;
        },
      },
    });
    (window as any).__hr = (value: number) => {
      characteristic.value = new DataView(new Uint8Array([0, value]).buffer);
      characteristic.dispatchEvent(new Event("characteristicvaluechanged"));
    };
  });
  await page.goto("/");
  await page.locator("#connect-top").click();
  await page.locator("#connect-heart").click();
  await page.evaluate(() => (window as any).__hr(153));
  await expect(page.locator("#hr-status")).toContainText("153 bpm");
  await page.locator("#modal-close").click();
  await expect(page.locator("#heart")).toHaveText("153");
  await expect(page.locator("#watts")).toHaveText("165");
  await expect(page.locator("#heart")).toHaveText("—", { timeout: 7000 });
  await page.evaluate(() => (window as any).__hr(160));
  await expect(page.locator("#heart")).toHaveText("160");
  await page.locator("#connect-top").click();
  await page.locator("#disconnect-heart").click();
  await page.locator("#modal-close").click();
  await expect(page.locator("#heart")).toHaveText("—");
});

test("valid measured ramp result applies FTP only after exhaustion confirmation and persists", async ({
  page,
}) => {
  // Seed only the measurement window; the calculator itself is covered by unit tests.
  // The page still runs its real sensor, finish, confirmation and profile storage handlers.
  const { usbTrainer } = await import("./mocks");
  await usbTrainer(page);
  await page.route("**/src/ramp-test.ts", async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    const patched = body.replace(
      "class RampMeasurement {",
      "class RampMeasurement { constructor() { this.add(300, 60); }",
    );
    expect(patched).not.toBe(body);
    await route.fulfill({ response, body: patched });
  });
  await page.goto("/");
  await page.locator("#connect-top").click();
  await page.locator("#choose-serial").click();
  await expect(page.locator("#connection-status")).toContainText("수신 중");
  await page.locator("#modal-close").click();
  await page.locator("#training-open").click();
  await page.locator('[data-plan="ramp"]').click();
  await page.locator("#apply-plan").click();
  await page.locator("#start").click();
  await page.locator("#finish").click();
  await expect(page.locator(".ramp-result")).toContainText("225 W");
  await expect(page.locator("#apply-ftp")).toBeDisabled();
  await page.locator("#ramp-exhausted").check();
  await page.locator("#apply-ftp").click();
  await expect(page.locator("#apply-ftp")).toHaveText("FTP 225 W 적용 완료");
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("velora-settings")!).ftp,
    ),
  ).toBe(225);
  await page.screenshot({ path: "docs/ramp-result.png" });
  await page.reload();
  await page.locator("#settings-open").click();
  await expect(page.locator("#ftp-input")).toHaveValue("225");
});

test.beforeEach(async ({page}) => { await isolateCompanion(page); });
