import { saveSetting } from "./persistence";
import { workouts, type Workout, type Step } from "./workouts";
export const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const storageKey = "velora-custom-workouts-v1";
export function validateCustom(value: unknown): Workout {
  const w = value as Workout;
  if (
    !w ||
    typeof w.name !== "string" ||
    !w.name.trim() ||
    w.name.length > 60 ||
    !Array.isArray(w.steps) ||
    !w.steps.length ||
    w.steps.length > 100
  )
    throw new Error("이름과 1–100개의 단계를 입력하세요.");
  const steps = w.steps.map((s, i): Step => {
    if (
      !s ||
      !Number.isInteger(s.seconds) ||
      s.seconds < 1 ||
      s.seconds > 7200 ||
      !Number.isFinite(s.factor) ||
      s.factor < 0.1 ||
      s.factor > 2.5
    )
      throw new Error("단계는 1–7200초, FTP 10–250% 범위입니다.");
    return {
      label: `단계 ${i + 1}`,
      seconds: s.seconds,
      factor: s.factor,
      cadenceLow: 80,
      cadenceHigh: 95,
    };
  });
  if (steps.reduce((n, s) => n + s.seconds, 0) > 21600)
    throw new Error("전체 훈련은 최대 6시간입니다.");
  return {
    name: w.name.trim(),
    category: "내 훈련",
    detail: "직접 만든 ERG 훈련",
    description: "내 목표에 맞춘 파워와 시간. 케이던스는 80–95 rpm 권장.",
    origin: "내 라이브러리 · 이 브라우저에 저장",
    steps,
  };
}
export function loadCustom() {
  try {
    const data = JSON.parse(localStorage.getItem(storageKey) || "{}");
    for (const [key, value] of Object.entries(data))
      if (/^custom-[a-z0-9-]{1,50}$/.test(key)) {
        try {
          workouts[key] = validateCustom(value);
        } catch {
          /* Skip damaged entries. */
        }
      }
  } catch {
    /* Storage may be unavailable. */
  }
}
export function mountEditor(
  host: HTMLElement,
  key: string | undefined,
  done: (key?: string) => void,
) {
  const original = key ? workouts[key] : null;
  let steps = (original?.steps ?? [{ factor: 0.65, seconds: 300 }]).map(
    (s) => ({ factor: s.factor, seconds: s.seconds }),
  );
  host.innerHTML = `<div class="training-library workout-editor"><span class="eyebrow orange">BUILD YOUR SESSION</span><h2>${key ? "훈련 수정" : "나만의 훈련 만들기"}</h2><p>FTP 비율과 시간을 순서대로 입력하세요. 손잡이를 드래그하거나 ↑ ↓ 버튼으로 순서를 바꿀 수 있습니다.</p><form id="editor-form"><label>훈련 이름<input id="editor-name" maxlength="60" required value="${escapeHtml(original?.name ?? "나의 인터벌")}"/></label><div class="editor-columns"><span>순서</span><span>FTP %</span><span>시간 (초)</span><span>순서 / 삭제</span></div><div id="editor-steps"></div><button type="button" id="add-step" class="secondary">+ 단계 추가</button><p id="editor-total"></p><p id="editor-error" role="alert"></p><div class="editor-actions"><button class="primary" type="submit">라이브러리에 저장</button><button type="button" id="cancel-editor" class="secondary">취소</button></div></form></div>`;
  const list = host.querySelector<HTMLElement>("#editor-steps")!;
  const sync = () => {
    steps = [...list.children].map((row) => ({
      factor:
        Number(row.querySelector<HTMLInputElement>("[data-factor]")!.value) /
        100,
      seconds: Number(
        row.querySelector<HTMLInputElement>("[data-seconds]")!.value,
      ),
    }));
  };
  const total = () => {
    host.querySelector("#editor-total")!.textContent =
      `${steps.length}개 단계 · 총 ${(steps.reduce((n, s) => n + s.seconds, 0) / 60).toFixed(1)}분`;
  };
  const move = (from: number, to: number) => {
    sync();
    if (to < 0 || to >= steps.length) return;
    steps.splice(to, 0, steps.splice(from, 1)[0]);
    draw();
    list.children[to]
      .querySelector<HTMLButtonElement>("[data-handle]")
      ?.focus();
  };
  let drag = -1;
  const draw = () => {
    list.innerHTML = steps
      .map(
        (s, i) =>
          `<div class="editor-step" data-index="${i}"><button type="button" data-handle draggable="true" aria-label="단계 ${i + 1} 드래그">⠿ ${i + 1}</button><input aria-label="단계 ${i + 1} FTP 비율" data-factor type="number" min="10" max="250" step="1" required value="${Math.round(s.factor * 100)}"/><input aria-label="단계 ${i + 1} 시간 초" data-seconds type="number" min="1" max="7200" step="1" required value="${s.seconds}"/><div><button type="button" data-up aria-label="단계 ${i + 1} 위로" ${i === 0 ? "disabled" : ""}>↑</button><button type="button" data-down aria-label="단계 ${i + 1} 아래로" ${i === steps.length - 1 ? "disabled" : ""}>↓</button><button type="button" data-delete aria-label="단계 ${i + 1} 삭제" ${steps.length === 1 ? "disabled" : ""}>×</button></div></div>`,
      )
      .join("");
    [...list.children].forEach((node, i) => {
      const row = node as HTMLElement;
      row.querySelector<HTMLElement>("[data-handle]")!.ondragstart = (e) => {
        sync();
        drag = i;
        e.dataTransfer!.setData("text/plain", String(i));
        e.dataTransfer!.effectAllowed = "move";
      };
      row.ondragover = (e) => {
        e.preventDefault();
      };
      row.ondrop = (e) => {
        e.preventDefault();
        if (drag >= 0) move(drag, i);
        drag = -1;
      };
      row.ondragend = () => {
        drag = -1;
      };
      row.querySelector<HTMLElement>("[data-up]")!.onclick = () =>
        move(i, i - 1);
      row.querySelector<HTMLElement>("[data-down]")!.onclick = () =>
        move(i, i + 1);
      row.querySelector<HTMLElement>("[data-delete]")!.onclick = () => {
        sync();
        steps.splice(i, 1);
        draw();
      };
    });
    total();
  };
  list.oninput = () => {
    sync();
    total();
  };
  host.querySelector<HTMLElement>("#add-step")!.onclick = () => {
    sync();
    if (steps.length < 100) {
      steps.push({ factor: 0.65, seconds: 300 });
      draw();
    }
  };
  host.querySelector<HTMLElement>("#cancel-editor")!.onclick = () => done();
  host.querySelector<HTMLFormElement>("#editor-form")!.onsubmit = (e) => {
    e.preventDefault();
    sync();
    try {
      const w = validateCustom({
        name: host.querySelector<HTMLInputElement>("#editor-name")!.value,
        steps,
      });
      const id = key ?? `custom-${crypto.randomUUID()}`;
      const all = Object.fromEntries(
        Object.entries(workouts).filter(([k]) => k.startsWith("custom-")),
      );
      all[id] = w;
      saveSetting(storageKey, JSON.stringify(all));
      workouts[id] = w;
      done(id);
    } catch (e) {
      host.querySelector("#editor-error")!.textContent = (e as Error).message;
    }
  };
  draw();
}
