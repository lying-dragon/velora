import { escapeHtml as esc } from "./workout-editor";
import {
  workouts,
  workoutDuration,
  workoutStep,
  workoutMetrics,
} from "./workouts";
import { zone, zoneColors, formatTime } from "./physics";
const clock = (s: number) =>
  formatTime(Math.max(0, s)).slice(s >= 3600 ? 0 : 3);
export function workoutBars(key: string, ftp: number, elapsed = -1) {
  let start = 0;
  const total = workoutDuration(key);
  return workouts[key].steps
    .map((s, i) => {
      const end = start + s.seconds;
      const state = elapsed >= end ? "done" : elapsed >= start ? "active" : "";
      start = end;
      const color = zoneColors[zone(s.factor * ftp, ftp) - 1];
      return `<i class="${state}" data-step="${i}" style="flex:${s.seconds};height:${Math.max(9, Math.max(s.factor, s.factorEnd ?? 0) * 58)}px;--h:${Math.max(9, Math.max(s.factor, s.factorEnd ?? 0) * 28)};background:${color}" title="${esc(s.label)} · ${clock(s.seconds)} · ${Math.round(s.factor * ftp)}${s.factorEnd !== undefined ? " → " + Math.round(s.factorEnd * ftp) : ""} W"></i>`;
    })
    .join("");
}
export function libraryHtml(ftp: number, selected: string, active: boolean) {
  return `<div class="training-library"><div class="library-intro"><div><span class="eyebrow orange">TRAIN WITH PURPOSE</span><h2>오늘의 페이스를 설계하세요.</h2><p>코스를 달릴 땐 <b>SIM 경사</b>, 훈련할 땐 <b>ERG 파워</b>.<br/>훈련 중에는 언덕에서도 정해진 목표 파워를 유지합니다.</p></div><span class="ftp-badge">MY FTP<strong>${ftp}<small> W</small></strong></span></div><button id="create-workout" class="primary">+ 나만의 훈련 만들기</button><div class="library-tabs" role="group" aria-label="훈련 분류">${["전체", "Z2", "LSD", "인터벌", "회복", "테스트", "내 훈련", "자유"].map((c, i) => `<button data-filter="${c}" class="${i === 0 ? "active" : ""}">${c}</button>`).join("")}</div><div class="library-grid">${Object.entries(
    workouts,
  )
    .map(([key, w]) => {
      const m = workoutMetrics(key);
      return `<button class="training-tile ${key === selected ? "selected" : ""}" data-plan="${key}" data-category="${w.category}"><div class="tile-top"><span>${w.category} · ${key === "free" ? "SIM" : "ERG"}</span><span>${key === selected ? "선택됨" : "↗"}</span></div><h3>${esc(w.name)}</h3><p>${esc(w.description)}</p><div class="plan-bars">${workoutBars(key, ftp) || '<span class="free-wave">∿ ∿ ∿ ∿ ∿</span>'}</div><div class="tile-stats"><span><b>${key === "free" ? "∞" : m.minutes}</b> 분</span><span>강도 <b>${m.intensity.toFixed(2)}</b> IF</span><span>예상 <b>${m.tss}</b> TSS</span></div><small>${esc(w.origin)}</small></button>`;
    })
    .join(
      "",
    )}</div><div class="plan-detail" id="plan-detail"></div><p class="fine-print">IF/TSS는 계획 파워로 계산한 추정치입니다. 케이던스는 VELORA의 권장 범위이며 강제 제어하지 않습니다.${active ? " 훈련 변경 시 현재 기록이 초기화됩니다. 종료 후 CSV를 먼저 저장하세요." : ""}</p></div>`;
}
export function detailHtml(key: string, ftp: number) {
  const w = workouts[key];
  return `<div class="plan-detail-head"><div><span class="eyebrow orange">SESSION OVERVIEW</span><h3>${esc(w.name)}</h3><p>${esc(w.origin)} ${w.source ? `· <a href="${w.source}" download>원본 ZWO</a>` : ""}</p></div><button class="primary" id="apply-plan" data-workout="${key}">${key === "free" ? "자유 라이딩 선택" : "이 훈련 선택"} →</button></div>${key.startsWith("custom-") ? `<button class="secondary" id="edit-workout">이 훈련 수정</button>` : ""}${key === "ramp" ? `<p class="ramp-guide">가능한 일정한 케이던스를 유지하고, 더 이상 목표 파워를 유지할 수 없으면 ‘종료’를 누르세요. 최고 60초 <b>실측</b> 평균의 75%는 FTP 추정치입니다. 데모·중단·신호 끊김·강도 변경 기록은 적용할 수 없습니다. 설정 FTP에 따라 최대 1,000 W까지 진행하며 상한 도달 시 재평가가 필요합니다.</p>` : ""}${w.steps.length ? `<div class="step-table"><div class="step-table-head"><span>단계</span><span>시간</span><span>목표 파워</span><span>권장 케이던스</span></div>${w.steps.map((s, i) => `<div><span><small>${String(i + 1).padStart(2, "0")}</small>${esc(s.label)}</span><span>${clock(s.seconds)}</span><span>${Math.round(s.factor * ftp)}${s.factorEnd !== undefined ? " → " + Math.round(s.factorEnd * ftp) : ""} W</span><span>${s.cadenceLow}–${s.cadenceHigh} rpm</span></div>`).join("")}</div>` : "<p>실제 코스 경사를 로라 저항에 반영합니다. 속도는 실측 파워·체중·경사·코너 곡률로 계산합니다.</p>"}`;
}
export function trainingHud(
  key: string,
  time: number,
  ftp: number,
  intensity: number,
  cadence: number | null,
  waiting: boolean,
) {
  const step = workoutStep(key, time),
    total = workoutDuration(key),
    pct = total ? Math.min(100, (time / total) * 100) : 0;
  if (!step)
    return `<div class="training-complete"><span>SESSION COMPLETE</span><strong>훈련 완료</strong><p>부하 해제를 요청했습니다. 제어 상태를 확인하고 기록을 저장하세요.</p></div>`;
  const next = step.next,
    target = Math.round(step.factor * ftp * intensity),
    coaching = waiting
      ? "페달을 밟으면 훈련이 진행됩니다"
      : cadence === null
        ? "케이던스 센서 미수신"
        : cadence < step.cadenceLow
          ? "케이던스를 조금 올려주세요"
          : cadence > step.cadenceHigh
            ? "페달을 조금 천천히 돌려주세요"
            : "좋아요, 이 리듬을 유지하세요";
  return `<div class="training-heading"><span><i></i> ERG WORKOUT <b>${esc(workouts[key].name)}</b></span><span>${Math.round(pct)}% · ${clock(total - time)} 남음</span></div><div class="training-now-next"><div class="training-current"><small>지금 · ${step.index + 1}/${workouts[key].steps.length} ${esc(step.label)}</small><div><strong id="training-power">${target}<em> W</em></strong><span class="cadence-target">${step.cadenceLow}–${step.cadenceHigh}<small>rpm 권장</small></span><span class="interval-countdown" id="interval-countdown">${clock(step.remaining)}</span></div><p>${coaching}</p></div><div class="training-next"><small>UP NEXT · ${next ? clock(step.remaining) + " 후" : "마지막 단계"}</small><b>${esc(next?.label ?? "훈련 완료")}</b><span>${next ? Math.round(next.factor * ftp * intensity) + " W · " + next.cadenceLow + "–" + next.cadenceHigh + " rpm" : "저항 해제 · 기록 저장"}</span></div></div><div class="session-track" role="progressbar" aria-label="훈련 전체 진행률" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100"><div class="plan-bars">${workoutBars(key, ftp * intensity, time)}</div><i class="session-playhead" style="left:${pct}%"></i></div><div class="training-meta"><span>${clock(time)} / ${clock(total)}</span><span>전체 훈련 구성 · 코스 경사와 독립적인 ERG</span></div>`;
}
