import { test, expect } from "@playwright/test";
import { isolateCompanion } from "./service-mock";
test.beforeEach(async ({ page }) => {
  await isolateCompanion(page);
});
test("finished ride generates a PNG, text and TCX and submits only to companion", async ({
  page,
}) => {
  let submitted: any;
  await page.route("http://127.0.0.1:18766/rides", async (route) => {
    submitted = route.request().postDataJSON();
    await route.fulfill({
      json: {
        id: submitted.id,
        state: "local",
        message: "데모 기록 · 로컬 저장만",
      },
    });
  });
  await page.goto("/");
  await page.locator("#start").click();
  await page.waitForTimeout(1100);
  await page.locator("#finish").click();
  await expect(page.locator(".activity-share")).toBeVisible();
  await expect(page.locator("[data-upload]")).toContainText("데모 기록");
  expect(submitted.png).toMatch(/^data:image\/png;base64,/);
  expect(submitted.tcx).toContain("<ae:Watts>");
  expect(submitted.description).toContain("실내 가상 라이딩");
  expect(submitted.source).toBe("demo");
  const download = page.waitForEvent("download");
  await page.locator("[data-tcx]").click();
  expect((await download).suggestedFilename()).toMatch(/\.tcx$/);
  await page.screenshot({ path: "docs/activity-share.png", fullPage: true });
});
test("profile and custom library recover from computer backup into a fresh browser", async ({
  page,
}) => {
  const now = Date.now();
  await page.route("http://127.0.0.1:18766/settings", async (route) => {
    await route.fulfill({
      json:
        route.request().method() === "GET"
          ? {
              "velora-settings": {
                value: JSON.stringify({ ftp: 265, weight: 69 }),
                updatedAt: now,
              },
              "velora-custom-workouts-v1": {
                value: JSON.stringify({
                  "custom-restored": {
                    name: "재시작 후 복원",
                    steps: [{ seconds: 120, factor: 0.7 }],
                  },
                }),
                updatedAt: now,
              },
              "velora-preferences": {
                value: JSON.stringify({
                  route: "alpine",
                  workout: "custom-restored",
                  cameraMode: 1,
                  autoResistance: false,
                  onboardingDone: true,
                }),
                updatedAt: now,
              },
            }
          : { saved: true },
    });
  });
  await page.goto("/");
  await expect(page.locator("#workout-name")).toHaveText("재시작 후 복원");
  await expect(page.locator("#control-toggle")).toHaveText("자동 저항 OFF");
  await page.locator("#settings-open").click();
  await expect(page.locator("#ftp-input")).toHaveValue("265");
  await expect(page.locator("#weight-input")).toHaveValue("69");
  await expect(page.locator("#open-strava-web")).toBeVisible();
  await page.locator("#modal-close").click();
  await page.locator("#training-open").click();
  await expect(page.locator('[data-plan="custom-restored"]')).toBeVisible();
});
test("Strava setup describes browser upload and desktop availability", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#settings-open").click();
  await expect(page.locator(".integration-settings")).toContainText("API");
  await expect(page.locator("#open-strava-web")).toBeVisible();
  await page.screenshot({ path: "docs/strava-settings.png" });
});
