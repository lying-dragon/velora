import type { Page } from "@playwright/test";
/** Keep browser regression fixtures isolated from the user's disk profile/account. */
export async function isolateCompanion(page: Page) {
  await page.addInitScript(()=>{const prefs=JSON.parse(localStorage.getItem("velora-preferences")||"{}");localStorage.setItem("velora-preferences",JSON.stringify({...prefs,onboardingDone:true}));});
  await page.route("http://127.0.0.1:18766/**", async (route) => {
    const url = new URL(route.request().url());
    let data: any = {};
    if (url.pathname === "/status")
      data = {
        connected: false,
        configured: false,
        autoUpload: true,
        dataDir: "test fixture",
        rides: [],
      };
    else if (url.pathname === "/rides")
      data = { id: "test-ride", state: "local", message: "테스트 로컬 저장" };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
}
