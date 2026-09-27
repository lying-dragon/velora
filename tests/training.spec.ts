import { isolateCompanion } from "./service-mock";
import { test, expect } from "@playwright/test";
import { usbTrainer, bleTrainer } from "./mocks";
async function choose(page: any, key: string) {
  await page.locator("#training-open").click();
  await page.locator(`[data-plan="${key}"]`).click();
  await page.locator("#apply-plan").click();
}
async function connect(page: any, id: string) {
  await page.locator("#connect-top").click();
  await page.locator(id).click();
  await expect(page.locator("#connection-status")).toContainText("수신 중");
  await page.locator("#modal-close").click();
}
test("library filters, whole workout preview, current/next targets, intensity, pause and completion", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#training-open").click();
  await page.locator('[data-filter="LSD"]').click();
  await expect(page.locator('[data-plan="lsd"]')).toBeVisible();
  await expect(page.locator('[data-plan="vo2"]')).toBeHidden();
  await page.locator('[data-filter="전체"]').click();
  await page.locator('[data-plan="endurance"]').click();
  await page.screenshot({ path: "docs/training-library.png" });
  await page.locator("#apply-plan").click();
  await expect(page.locator("#training-power")).toHaveText("88 W");
  await expect(page.locator(".training-next")).toContainText("147 W");
  await page.locator("#start").click();
  await page.locator("#skip-step").click();
  await expect(page.locator("#training-power")).toHaveText("147 W");
  await expect(page.locator(".training-next")).toContainText("쿨다운");
  await page.locator("#intensity-down").click();
  await expect(page.locator("#training-power")).toHaveText("140 W");
  await page.screenshot({ path: "docs/training-ride.png" });
  await page.locator("#start").click();
  const countdown = await page.locator("#interval-countdown").textContent();
  await page.waitForTimeout(1200);
  await expect(page.locator("#interval-countdown")).toHaveText(countdown!);
  await expect(page.locator("#control-status")).toContainText("저항 해제");
  await page.locator("#skip-step").click();
  await page.locator("#skip-step").click();
  await expect(page.locator("#training-hud")).toContainText("훈련 완료");
  await expect(page.locator("#control-status")).toContainText("저항 해제");
});
test("WebANT sends actual SIM then ERG packets and releases on pause and signal loss", async ({
  page,
}) => {
  await usbTrainer(page);
  await page.goto("/");
  await connect(page, "#choose-serial");
  await page.locator("#start").click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).__trainer.writes.some(
          (a: number[]) => a[2] === 79 && a[4] === 51,
        ),
      ),
    )
    .toBe(true);
  await page.locator("#start").click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).__trainer.writes
            .filter((a: number[]) => a[2] === 79)
            .at(-1)?.[4],
      ),
    )
    .toBe(48);
  await choose(page, "endurance");
  await page.locator("#start").click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).__trainer.writes.some(
          (a: number[]) => a[2] === 79 && a[4] === 49,
        ),
      ),
    )
    .toBe(true);
  await expect(page.locator("#control-status")).toContainText("ERG");
  await page.evaluate(() => ((window as any).__trainer.transmit = false));
  await expect(page.locator("#watts")).toHaveText("0", { timeout: 6000 });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).__trainer.writes
            .filter((a: number[]) => a[2] === 79)
            .at(-1)?.[4],
      ),
    )
    .toBe(48);
});
test("FTMS obtains control, sets target with response, starts, then stops; SIM has signed slope", async ({
  page,
}) => {
  await bleTrainer(page);
  await page.goto("/");
  await choose(page, "endurance");
  await connect(page, "#choose-ble");
  await page.locator("#start").click();
  await expect(page.locator("#control-status")).toContainText("로라 응답 확인");
  const ops = await page.evaluate(() =>
    (window as any).__ble.writes.map((a: number[]) => a[0]),
  );
  expect(ops).toEqual(expect.arrayContaining([0, 5, 7]));
  expect(ops.indexOf(0)).toBeLessThan(ops.indexOf(5));
  await page.locator("#start").click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__ble.writes.at(-1)?.[0]))
    .toBe(8);
  await choose(page, "free");
  await page.locator("#start").click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).__ble.writes.some((a: number[]) => a[0] === 17),
      ),
    )
    .toBe(true);
});
test("mobile has accessible workout selection and training HUD without horizontal scroll", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await choose(page, "endurance");
  await expect(page.locator("#training-hud")).toBeVisible();
  await expect(page.locator("#training-power")).toHaveText("88 W");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page.screenshot({ path: "docs/training-mobile.png" });
});

test("FTMS unsupported mode shows failure and does not send an ERG target", async ({
  page,
}) => {
  await bleTrainer(page, 8192);
  await page.goto("/");
  await choose(page, "endurance");
  await connect(page, "#choose-ble");
  await page.locator("#start").click();
  await expect(page.locator("#control-status")).toContainText("ERG를 지원하지");
  expect(
    await page.evaluate(() =>
      (window as any).__ble.writes.some((a: number[]) => a[0] === 5),
    ),
  ).toBe(false);
});
test("stopping pedaling freezes workout countdown and releases the trainer", async ({
  page,
}) => {
  await usbTrainer(page);
  await page.goto("/");
  await choose(page, "endurance");
  await connect(page, "#choose-serial");
  await page.locator("#start").click();
  await expect(page.locator("#control-status")).toContainText("ERG");
  await page.evaluate(() => {
    (window as any).__trainer.power = 0;
    (window as any).__trainer.cadence = 0;
  });
  await expect(page.locator("#training-hud")).toContainText("페달을 밟으면");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).__trainer.writes
            .filter((a: number[]) => a[2] === 79)
            .at(-1)?.[4],
      ),
    )
    .toBe(48);
  const countdown = await page.locator("#interval-countdown").textContent();
  await page.waitForTimeout(1200);
  await expect(page.locator("#interval-countdown")).toHaveText(countdown!);
});

test.beforeEach(async ({page}) => { await isolateCompanion(page); });
