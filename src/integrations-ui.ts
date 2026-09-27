import { service, storageStatus } from "./persistence";
import { escapeHtml as esc } from "./workout-editor";
import {
  activityText,
  activityTcx,
  activityImage,
  downloadFile,
  type Activity,
} from "./activity";
const desktop = () => (window as any).velora;
export function integrationHtml() {
  return `<section class="integration-settings"><h3>저장과 Strava 웹 업로드</h3><p id="storage-status">${esc(storageStatus())}</p><p>API 키·유료 개발자 등록 없이 Strava 웹 화면의 파일 선택, 문구 입력, 사진 첨부를 진행합니다.</p><div class="integration-actions"><button id="open-strava-web" class="primary">Strava 로그인 창 열기</button><button id="refresh-strava" class="secondary">기록 새로고침</button></div><label><input id="auto-strava" type="checkbox"/> 종료 시 Strava 웹 업로드 자동 시작</label><p id="strava-status" role="status"></p><p>데스크톱 앱 전용 자동화입니다. 처음 한 번 앱의 Strava 창에 로그인하세요. 현재 브라우저의 로그인 쿠키는 가져오지 않습니다. 로그인·사람 확인·화면 변경이 있으면 멈추고 알려드립니다. 10초 이상 센서 기록만 자동 전송하며 데모는 제외합니다. 새 활동은 나만 보기로 저장합니다.</p><details><summary>최근 기록 / 사진과 파일</summary><div id="recent-rides"></div></details></section>`;
}
export function bindIntegrations(host: HTMLElement) {
  const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
    host.querySelector<T>("#" + id)!;
  const report = (text: string) => {
    if (host.isConnected) $("strava-status").textContent = text;
  };
  const refresh = async () => {
    try {
      const state = await service("/status");
      if (!host.isConnected) return;
      report(
        desktop()
          ? "Strava 로그인 후 웹 업로드를 사용할 수 있습니다."
          : "현재는 웹 브라우저입니다. 파일·이미지를 다운로드해 직접 올리거나 VELORA 데스크톱 앱을 사용하세요.",
      );
      $("storage-status").textContent = storageStatus();
      $<HTMLInputElement>("auto-strava").checked = state.autoUpload;
      $("recent-rides").replaceChildren();
      for (const ride of state.rides) {
        const row = document.createElement("div");
        row.className = "saved-ride";
        row.innerHTML = `<b>${esc(ride.title)}</b><p>${esc(ride.message)}</p><button class="secondary" data-download>공유 PNG</button> <button class="secondary" data-tcx>TCX</button> <button class="secondary" data-web ${!desktop() || ride.source === "demo" || ride.duration < 10 || ride.state === "complete" ? "disabled" : ""}>웹 업로드</button> ${/^\d+$/.test(ride.activityId || "") ? `<a href="https://www.strava.com/activities/${ride.activityId}" target="_blank" rel="noopener">Strava에서 보기 ↗</a>` : ""}`;
        for (const [selector, kind] of [
          ["[data-download]", "png"],
          ["[data-tcx]", "tcx"],
        ])
          row.querySelector<HTMLElement>(selector)!.onclick = async () => {
            try {
              const file = await service(`/rides/${ride.id}/files`);
              downloadFile(
                file[kind],
                `velora-${ride.id}.${kind}`,
                kind === "png" ? "image/png" : "application/xml",
              );
            } catch (e) {
              report((e as Error).message);
            }
          };
        row.querySelector<HTMLElement>("[data-web]")!.onclick = async () => {
          try {
            report("Strava 창에서 업로드를 진행합니다.");
            const result = await desktop().uploadRide(ride.id);
            await refresh();
            report(result.message);
          } catch (e) {
            report((e as Error).message);
          }
        };
        $("recent-rides").append(row);
      }
    } catch {
      report(
        "컴퓨터 저장 서비스 미연결. 종료 화면에서 TCX와 PNG를 다운로드할 수 있습니다.",
      );
    }
  };
  $("open-strava-web").onclick = async () => {
    if (desktop()) {
      try {
        await desktop().openStrava();
      } catch (e) {
        report((e as Error).message);
      }
    } else
      window.open("https://www.strava.com/upload/select", "_blank", "noopener");
  };
  $("refresh-strava").onclick = () => void refresh();
  $("auto-strava").onchange = async () => {
    try {
      await service("/web/preferences", {
        method: "PUT",
        body: JSON.stringify({
          autoUpload: $<HTMLInputElement>("auto-strava").checked,
        }),
      });
      report("설정을 저장했습니다.");
    } catch (e) {
      report((e as Error).message);
    }
  };
  void refresh();
}
export function attachActivity(host: HTMLElement, a: Activity) {
  const text = activityText(a),
    tcx = activityTcx(a),
    png = activityImage(a);
  const panel = document.createElement("section");
  panel.className = "activity-share";
  panel.innerHTML = `<h3>오늘의 라이딩 카드</h3><img alt="자동 생성한 라이딩 요약 이미지"/><p class="activity-description"></p><div class="integration-actions"><button class="secondary" data-png>공유 이미지 PNG</button><button class="secondary" data-tcx>활동 파일 TCX</button><button class="secondary" data-copy>문구 복사</button></div><p data-upload role="status">기록을 컴퓨터에 저장하는 중…</p><p>이미지는 자동 생성됩니다. 데스크톱 앱에서는 사진까지 웹 화면에 첨부하고, 일반 브라우저에서는 다운로드해 Strava에 추가하세요.</p>`;
  panel.querySelector("img")!.src = png;
  panel.querySelector(".activity-description")!.textContent = text.description;
  panel.querySelector<HTMLElement>("[data-png]")!.onclick = () =>
    downloadFile(png, `velora-${a.id}.png`, "image/png");
  panel.querySelector<HTMLElement>("[data-tcx]")!.onclick = () =>
    downloadFile(tcx, `velora-${a.id}.tcx`, "application/xml");
  panel.querySelector<HTMLElement>("[data-copy]")!.onclick = async () => {
    try {
      await navigator.clipboard.writeText(text.description);
      panel.querySelector("[data-copy]")!.textContent = "복사 완료";
    } catch {
      panel.querySelector("[data-copy]")!.textContent =
        "문구를 선택해 복사하세요";
    }
  };
  host.append(panel);
  const show = (job: any) => {
    const status = panel.querySelector<HTMLElement>("[data-upload]")!;
    status.textContent = job.message || "Strava 연결 후 업로드 대기";
    if (/^\d+$/.test(job.activityId || "")) {
      const link = document.createElement("a");
      link.href = `https://www.strava.com/activities/${job.activityId}`;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = " Strava에서 보기 ↗";
      status.append(link);
    }
  };
  void (async () => {
    try {
      const job = await service("/rides", {
        method: "POST",
        body: JSON.stringify({
          id: a.id,
          source: a.source,
          duration: a.duration,
          ...text,
          tcx,
          png,
        }),
      });
      show(job);
      if (
        desktop() &&
        job.autoUpload &&
        a.source !== "demo" &&
        a.duration >= 10 &&
        job.state !== "complete"
      ) {
        const result = await desktop().uploadRide(a.id);
        show(result);
      }
      let attempts = 0;
      const poll = async () => {
        if (!panel.isConnected || attempts++ >= 60) return;
        try {
          const next = await service(`/rides/${a.id}`);
          show(next);
          if (["queued", "processing", "uploading"].includes(next.state))
            setTimeout(() => void poll(), 5000);
        } catch {
          panel.querySelector("[data-upload]")!.textContent =
            "서비스 연결 중단 · 설정에서 저장/전송 상태를 확인하세요.";
        }
      };
      if (["queued", "processing", "uploading"].includes(job.state))
        setTimeout(() => void poll(), 5000);
    } catch {
      panel.querySelector("[data-upload]")!.textContent =
        "컴퓨터 저장 서비스에 연결하지 못했습니다. 창을 닫기 전에 TCX와 PNG를 다운로드하세요.";
    }
  })();
}
