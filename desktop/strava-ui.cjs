// These selectors correspond to the Strava web forms inspected on 2026-09-27.
// No Strava API, tokens, cookies or private endpoints are accessed by this adapter.
const fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os");
class StravaUi {
  constructor() {
    this.window = null;
    this.busy = false;
  }
  async open() {
    if (this.window && !this.window.isDestroyed()) {
      this.window.show();
      this.window.focus();
      return this.window;
    }
    const { BrowserWindow } = require("electron");
    this.window = new BrowserWindow({
      width: 1180,
      height: 860,
      title: "VELORA · Strava 웹 업로드",
      webPreferences: {
        partition: "persist:velora-strava",
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });
    this.window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    this.window.webContents.on("will-navigate", (e, url) => {
      const u = new URL(url);
      if (
        u.protocol !== "https:" ||
        !(
          u.hostname === "strava.com" ||
          u.hostname.endsWith(".strava.com") ||
          u.hostname === "accounts.google.com" ||
          u.hostname === "www.facebook.com" ||
          u.hostname === "appleid.apple.com"
        )
      )
        e.preventDefault();
    });
    await this.window.loadURL("https://www.strava.com/upload/select");
    return this.window;
  }
  async inspect() {
    return this.window.webContents.executeJavaScript(
      `({url:location.href,text:document.body.innerText,canSave:[...document.querySelectorAll('button,input[type=submit]')].some(e=>e.getClientRects().length&&!e.disabled&&/^(Save|Save & View|Save and View|Save Activity|저장|저장 및 보기)$/i.test((e.innerText||e.value||'').trim())),fields:[...document.querySelectorAll('input:not([type=password]):not([type=hidden]),textarea,select')].map(e=>({tag:e.tagName,type:e.type,name:e.name,id:e.id,placeholder:e.placeholder,visible:!!e.getClientRects().length})),media:[...document.querySelectorAll('[class*=MediaThumbnailList] img')].map(e=>({src:e.getAttribute('src'),loaded:e.complete&&e.naturalWidth>0})),images:[...document.querySelectorAll('img')].map(e=>({alt:e.alt,src:e.getAttribute('src'),loaded:e.complete&&e.naturalWidth>0})),links:[...document.querySelectorAll('a[href]')].map(e=>({text:e.innerText,href:e.href}))})`,
    );
  }
  async waitFor(check, timeout = 45000) {
    const until = Date.now() + timeout;
    while (Date.now() < until) {
      if (!this.window || this.window.isDestroyed())
        throw Error("Strava 창이 닫혔습니다.");
      const state = await this.inspect();
      if (/\/login|\/session|\/register/.test(new URL(state.url).pathname))
        throw Error("Strava 창에서 로그인한 뒤 다시 눌러주세요.");
      if (/captcha|verify you are human|보안 확인/i.test(state.text))
        throw Error(
          "Strava가 사람 확인을 요청했습니다. 창에서 직접 완료한 뒤 이어서 진행하세요.",
        );
      const result = check(state);
      if (result) return result;
      await new Promise((r) => setTimeout(r, 500));
    }
    throw Error(
      "Strava 화면을 확인해 주세요. 자동화가 예상한 입력을 찾지 못했습니다.",
    );
  }
  async file(selector, file) {
    const wc = this.window.webContents;
    if (!wc.debugger.isAttached()) wc.debugger.attach("1.3");
    try {
      const { root } = await wc.debugger.sendCommand("DOM.getDocument");
      const { nodeId } = await wc.debugger.sendCommand("DOM.querySelector", {
        nodeId: root.nodeId,
        selector,
      });
      if (!nodeId) throw Error("파일 입력을 찾지 못했습니다.");
      await wc.debugger.sendCommand("DOM.setFileInputFiles", {
        nodeId,
        files: [file],
      });
    } finally {
      wc.debugger.detach();
    }
  }
  async fill(selector, value) {
    return this.window.webContents.executeJavaScript(
      `(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('입력 필드가 변경되었습니다.');const proto=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`,
    );
  }
  async clickSave() {
    return this.window.webContents.executeJavaScript(
      `(()=>{const buttons=[...document.querySelectorAll('button,input[type=submit]')].filter(e=>e.getClientRects().length&&!e.disabled);const save=buttons.find(e=>/^(Save|Save & View|Save and View|Save Activity|저장|저장 및 보기)$/i.test((e.innerText||e.value||'').trim()));if(!save)throw Error('저장 버튼을 찾지 못했습니다. 직접 확인하세요.');save.click();return true;})()`,
    );
  }
  async privateIndoor() {
    await this.window.webContents.executeJavaScript(`(()=>{
      const trainer=document.querySelector('input[name="activity[trainer]"]');
      if(!trainer)throw Error('실내 라이딩 태그를 찾지 못했습니다.');
      if(!trainer.checked)trainer.click();
      const selected=document.querySelector('input[type=radio][name*="visibility"]:checked');
      if(!selected)throw Error('공개 범위를 찾지 못했습니다.');
      if(selected.value!=='only_me')selected.click();
    })()`);
    await this.window.webContents.executeJavaScript(`(()=>{
      const privateOption=document.querySelector('input[type=radio][name*="visibility"][value="only_me"]');
      if(!privateOption)throw Error('나만 보기 옵션을 찾지 못했습니다.');
      if(!privateOption.checked)privateOption.click();
      if(!privateOption.checked)throw Error('나만 보기 설정을 확인하지 못했습니다.');
    })()`);
  }
  async upload(ride, report) {
    if (this.busy) throw Error("다른 Strava 업로드를 진행 중입니다.");
    this.busy = true;
    let transmitted =
      !!ride.activityId || ["uploading", "needs_review"].includes(ride.state);
    let folder;
    try {
      if (ride.state === "complete")
        return {
          state: "complete",
          message: "이미 업로드한 활동입니다.",
          activityId: ride.activityId,
        };
      if (
        ["uploading", "needs_review"].includes(ride.state) &&
        !ride.activityId
      )
        throw Error(
          "이전 전송 결과가 불확실합니다. Strava에서 기존 활동을 확인해 주세요. 재업로드하지 않았습니다.",
        );
      if (ride.source === "demo" || ride.duration < 10)
        throw Error("데모 또는 10초 미만 기록은 자동 업로드하지 않습니다.");
      await this.open();
      await this.window.loadURL(
        ride.activityId
          ? `https://www.strava.com/activities/${ride.activityId}/edit`
          : "https://www.strava.com/upload/select",
      );
      folder = await fs.mkdtemp(path.join(os.tmpdir(), "velora-share-"));
      const tcx = path.join(folder, "ride.tcx"),
        png = path.join(folder, "ride.png");
      await fs.writeFile(tcx, ride.tcx, { mode: 0o600 });
      await fs.writeFile(png, Buffer.from(ride.png.split(",")[1], "base64"), {
        mode: 0o600,
      });
      let activityId = ride.activityId;
      if (!activityId) {
        await this.waitFor((s) =>
          s.fields.some((f) => f.type === "file" && f.name === "files[]"),
        );
        await report({
          state: "uploading",
          message: "Strava 웹 화면에서 기록 파일 선택 중",
        });
        transmitted = true;
        await this.file('input[type=file][name="files[]"]', tcx);
        const next = await this.waitFor((s) => {
          const current = s.url.match(/\/activities\/(\d+)/);
          if (current) return { id: current[1] };
          const edit = s.links.find((l) =>
            /\/activities\/\d+\/edit(?:\?|$)/.test(l.href),
          );
          if (edit) return { id: edit.href.match(/\/activities\/(\d+)/)[1] };
          if (
            s.fields.some(
              (f) =>
                f.visible &&
                (/title|name/i.test(f.name) || f.id === "activity_name"),
            )
          )
            return { form: true };
          if (/duplicate|already uploaded|이미 업로드/i.test(s.text))
            throw Error(
              "Strava에 이미 존재하는 기록입니다. 중복 업로드를 중단했습니다.",
            );
          return false;
        });
        if (next.id) activityId = next.id;
        else {
          const state = await this.inspect();
          const title = state.fields.find(
            (f) => f.visible && f.type === "text" && /title|name/i.test(f.name),
          );
          if (title)
            await this.fill(
              title.id
                ? "#" + title.id
                : `input[name=${JSON.stringify(title.name)}]`,
              ride.title,
            );
          await this.fill(
            'textarea:not([name="private_note"])',
            ride.description,
          );
          await this.privateIndoor();
          await this.clickSave();
          activityId = await this.waitFor(
            (s) => s.url.match(/\/activities\/(\d+)/)?.[1],
          );
        }
        await report({
          state: "uploading",
          message: "활동 생성됨 · 사진과 문구 입력 중",
          activityId,
        });
        await this.window.loadURL(
          `https://www.strava.com/activities/${activityId}/edit`,
        );
      }
      await this.waitFor(
        (s) =>
          s.fields.some((f) => f.id === "activity_name") &&
          s.fields.some((f) => f.type === "file"),
      );
      await this.fill("#activity_name", ride.title);
      const state = await this.inspect();
      const description = state.fields.find(
        (f) => f.tag === "TEXTAREA" && f.id !== "activity_private_note",
      );
      if (!description) throw Error("설명 입력란을 찾지 못했습니다.");
      await this.fill(
        description.id
          ? "#" + description.id
          : "textarea:not(#activity_private_note)",
        ride.description,
      );
      await this.privateIndoor();
      // A retry may reopen an activity whose photo was saved before verification failed.
      if (!state.images.some((image) => image.alt === "ride.png"))
        await this.file("input[type=file]", png);
      await this.waitFor(
        (s) =>
          s.canSave &&
          s.images.some((image) => image.alt === "ride.png" && image.loaded),
        30000,
      );
      await this.clickSave();
      await this.waitFor(
        (s) =>
          !new URL(s.url).pathname.endsWith("/edit") &&
          s.url.includes("/activities/" + activityId),
      );
      const final = await this.waitFor(
        (s) =>
          s.media.some((image) => image.loaded && /^https:/.test(image.src)) &&
          s,
      );
      if (!/Only you can view this activity|본인만|나만/.test(final.text))
        throw Error(
          "저장된 공개 범위를 확인하지 못했습니다. Strava 화면을 확인하세요.",
        );
      if (!final.text.includes(ride.title))
        throw Error("저장된 제목을 확인하지 못했습니다.");
      const result = {
        state: "complete",
        message: "기록·문구·사진 웹 업로드 완료 · 나만 보기",
        activityId,
      };
      await report(result);
      return result;
    } catch (e) {
      const result = {
        state: transmitted ? "needs_review" : "needs_login",
        message: e.message,
      };
      await report(result);
      return result;
    } finally {
      this.busy = false;
      if (folder) await fs.rm(folder, { recursive: true, force: true });
    }
  }
}
module.exports = { StravaUi };
