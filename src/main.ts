import { deviceBadges } from "./device-status";
import { guideHtml, bindGuide, needsGuide } from "./onboarding";
import "./style.css";
import {
  bootstrapPersistence,
  saveSetting,
  savePreferences,
  readPreferences,
} from "./persistence";
import {
  integrationHtml,
  bindIntegrations,
  attachActivity,
} from "./integrations-ui";
await bootstrapPersistence();
const preferences = readPreferences();
let rideId = crypto.randomUUID();
let rideStartedAt = Date.now();
import { loadCustom, mountEditor, escapeHtml } from "./workout-editor";
import { RampMeasurement } from "./ramp-test";
import { HeartRateSensor } from "./heart-rate";
loadCustom();
let rampMeasurement = new RampMeasurement();
let rampStopSeconds = 0;
let trainerHeart: number | null = null;
let hrStatus = "별도 심박계 미연결";
const heartSensor = new HeartRateSensor((message) => {
  hrStatus = message;
  const el = document.getElementById("hr-status");
  if (el) el.textContent = message;
});
function invalidateRamp(reason: string) {
  if (workout === "ramp" && started && !ended)
    rampMeasurement.invalidate(reason);
}

import { World, routes, type RouteKey } from "./world";
import {
  nextSpeed,
  formatTime,
  zone,
  zoneColors,
  workouts,
  workoutStep,
} from "./physics";
import { Sensors, type Reading } from "./sensors";
import { WebAnt } from "./web-ant";
import { workoutDuration } from "./workouts";
import {
  libraryHtml,
  detailHtml,
  trainingHud,
  workoutBars,
} from "./training-ui";
import { TrainerControl, chooseTarget } from "./trainer-control";

const icons: Record<string, string> = {
  bolt: '<path d="m13 2-8 12h6l-1 8 9-13h-6l1-7Z"/>',
  ride: '<circle cx="5.5" cy="16.5" r="4"/><circle cx="18.5" cy="16.5" r="4"/><path d="m5.5 16.5 5-9 4 9h-9m3-9h5m1-4h3l2 13"/>',
  mountain: '<path d="m2 20 8-15 5 9 3-5 5 11H2Z"/><path d="m7 11 3 2 3-2"/>',
  heart:
    '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  link: '<path d="M8 12a4 4 0 0 1 1-4l4-4a4 4 0 0 1 6 6l-2 2m-1 0a4 4 0 0 1-1 4l-4 4a4 4 0 0 1-6-6l2-2"/>',
  settings:
    '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/>',
  camera:
    '<rect x="2" y="6" width="20" height="15" rx="3"/><path d="m8 6 2-3h4l2 3"/><circle cx="12" cy="13" r="4"/>',
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  arrow: '<path d="m9 5 7 7-7 7"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path d="m8 4 12 8-12 8V4Z"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  flag: '<path d="M5 22V3c5-4 9 4 15 0v11c-6 4-10-4-15 0"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/>',
};
const icon = (name: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.ride}</svg>`;
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
let settings = { weight: 75, ftp: 220 };
let workoutElapsed = 0,
  intensity = 1,
  autoResistance = preferences.autoResistance !== false,
  controlStatus = "데모 · SIM 미리보기",
  trainingWaiting = false;
try {
  const stored = JSON.parse(localStorage.getItem("velora-settings") || "null");
  if (
    stored &&
    stored.weight >= 35 &&
    stored.weight <= 200 &&
    stored.ftp >= 50 &&
    stored.ftp <= 600
  )
    settings = stored;
} catch {}
let source: "demo" | "ant" | "ble" | "serial" = "demo",
  running = false,
  started = false,
  ended = false,
  elapsed = 0,
  distance = 0,
  speed = 0,
  ascent = 0,
  energy = 0,
  demoPower = 165,
  watts = 165,
  cadence: number | null = 82,
  heartRate: number | null = null,
  lastReading = 0,
  workout =
    typeof preferences.workout === "string" &&
    Object.hasOwn(workouts, preferences.workout)
      ? preferences.workout
      : "free",
  route: RouteKey = Object.hasOwn(routes, preferences.route)
    ? preferences.route
    : "coast";
workouts.ramp.steps = workouts.ramp.steps.filter(
  (s) => s.factor * settings.ftp <= 1000,
);
let samples: {
  seconds: number;
  recordedAt: number;
  watts: number;
  cadence: number | null;
  heartRate: number | null;
  distance: number;
  speed: number;
  source: string;
}[] = [];
let lastSample = -1,
  workoutDone = false;
const app = $("app");
app.innerHTML = `
<div id="world"></div><div class="world-vignette"></div>
<header class="topbar"><a class="brand" href="#" aria-label="Velora 홈"><span class="brand-symbol">v<span>◦</span></span>velora<span class="brand-tag">RIDE YOUR WORLD</span></a><div id="device-strip" class="device-strip" aria-label="실시간 장비 상태">${[
  ["power", "파워"],
  ["heart", "심박"],
  ["cadence", "케이던스"],
  ["trainer", "로라"],
]
  .map(
    ([id, label]) =>
      `<button class="device-chip" id="device-${id}" type="button"><i></i><span>${label}</span><b>미연결</b></button>`,
  )
  .join(
    "",
  )}</div><div class="top-right"><button id="training-open" class="connection-button training-nav">${icon("bolt")}<span>훈련 라이브러리</span></button><span class="local-badge"><i></i> LOCAL RIDE</span><button class="connection-button" id="connect-top">${icon("link")}<span id="source-label">데모 모드</span><span class="status-dot"></span></button><button class="avatar" id="profile-open" aria-label="라이더 설정">J</button></div></header>
<main>
<section class="ride-stats glass" aria-label="주행 기록"><div><span class="stat-label">속도</span><span><b id="speed">0.0</b><small>km/h</small></span></div><div><span class="stat-label">거리</span><span><b id="distance">0.00</b><small>km</small></span></div><div><span class="stat-label">획득 고도</span><span><b id="ascent">0</b><small>m</small></span></div><div><span class="stat-label">라이딩 시간</span><span><b id="time" class="time-value">00:00:00</b></span></div><div class="route-progress"><i id="progress"></i></div></section>
<aside class="left-panel"><section class="power-card glass"><div class="eyebrow">${icon("bolt")} LIVE POWER <span id="live-badge">DEMO</span></div><div class="power-number"><strong id="watts">165</strong><span>W</span></div><div class="power-sub"><span><b id="wkg">2.20</b> W/kg</span><span id="zone" class="zone-tag">Z2 · 지구력</span></div><div class="zone-strip">${zoneColors.map((c, i) => `<i style="background:${c}" data-zone="${i + 1}"></i>`).join("")}</div><div class="secondary-metrics"><div>${icon("ride")}<b id="cadence">82</b><small>rpm</small></div><div>${icon("heart")}<b id="heart">—</b><small>bpm</small></div></div></section>
<section class="workout-card glass"><div class="section-kicker">TODAY’S SESSION <span>01</span></div><button id="workout-open" class="workout-title"><span id="workout-name">자유 라이딩</span>${icon("arrow")}</button><p id="workout-description">나만의 페이스로, 끝없이</p><div id="workout-blocks" class="workout-blocks">${[20, 25, 32, 40, 48, 48, 48, 48, 48, 48, 40, 32, 25, 20].map((h) => `<i style="height:${h}px"></i>`).join("")}</div><div class="workout-bottom"><span id="workout-phase">JUST KEEP PEDALING</span><b id="target">FREE RIDE</b></div></section>
<div class="scenic-note"><span class="scenic-line"></span><span>조금 더 멀리.<br/><b>오늘은 나만의 페이스로.</b></span></div></aside>
<aside class="right-panel"><section class="map-card glass"><div class="map-header"><span>${icon("mountain")} <b id="map-title">에메랄드 코스트</b></span><span id="lap">LAP 01</span></div><canvas id="minimap" width="520" height="330" aria-label="코스 지도 및 라이더 위치"></canvas><div class="map-footer"><span id="route-length">2.0 km 루프</span><span class="grade"><span id="grade">0.0</span><small>% 경사</small></span></div></section><button class="route-select glass" id="routes-open"><span class="route-icon">${icon("mountain")}</span><span><small>EXPLORE YOUR WORLD</small><b>다른 코스 둘러보기</b></span>${icon("arrow")}</button><section class="nearby glass"><div class="section-kicker">함께 달리는 라이더 <span>가상 페이서</span></div><div class="rider-row me"><span class="rider-avatar">J</span><span><b>나의 라이딩</b><small>나만의 페이스</small></span><strong id="rider-wkg">2.2 <small>W/kg</small></strong></div><div class="rider-row"><span class="rider-avatar teal">M</span><span><b>Milo</b><small>일정한 페이스</small></span><strong>18.0 <small>km/h</small></strong></div><div class="rider-row"><span class="rider-avatar yellow">A</span><span><b>Aria</b><small>일정한 페이스</small></span><strong>20.5 <small>km/h</small></strong></div></section></aside>
<div class="location-label"><span>01 / <span id="location-type">COASTAL ROUTE</span></span><h1 id="location-name">EMERALD COAST</h1><p id="location-subtitle">바다와 숲 사이, 나를 위한 한 바퀴</p></div>
<section id="training-hud" class="training-hud glass" hidden></section><div id="training-adjust" class="training-adjust glass" hidden><button id="intensity-down" aria-label="훈련 강도 낮추기">−</button><span id="intensity-label">100% FTP 강도</span><button id="intensity-up" aria-label="훈련 강도 높이기">+</button><button id="skip-step">다음 단계 →</button></div><div class="control-badge glass" id="control-badge"><span id="control-status">데모 · SIM 미리보기</span><button id="control-toggle" aria-pressed="true">자동 저항 ON</button></div><div class="ride-prompt" id="ride-prompt"><span class="prompt-dot"></span><span id="prompt-text">새로운 라이딩이 기다리고 있어요</span><small id="prompt-sub">라이딩 시작을 누르고 페달을 밟아보세요</small></div>
<div class="view-controls"><button id="camera" class="glass icon-button" title="카메라 전환 (C)" aria-label="카메라 전환">${icon("camera")}</button><button id="fullscreen" class="glass icon-button" title="전체 화면" aria-label="전체 화면">${icon("expand")}</button></div>
</main>
<footer class="bottom-panel"><div class="chart-top"><span><i class="orange-dot"></i> 파워 타임라인 <small>최근 2분</small></span><span><b id="avg-power">0</b> W 평균 <i></i> <b id="energy">0</b> kJ</span></div><canvas id="power-chart" aria-label="파워 타임라인"></canvas><div class="toolbar"><div class="ride-actions"><button class="primary" id="start">${icon("play")}<span>라이딩 시작</span></button><button id="finish" class="secondary" disabled>${icon("flag")} 종료</button></div><div class="demo-control" id="demo-control"><span>데모 파워 <b id="demo-value">165 W</b></span><input aria-label="데모 파워" id="demo-power" type="range" min="0" max="500" value="165" step="5"/><span class="key-hint">← → 조절</span></div><div class="sensor-footer" id="sensor-footer" hidden>${icon("link")}<span id="sensor-name">센서 연결 대기</span></div><button class="settings-button" id="settings-open">${icon("settings")}<span>라이더 설정</span></button></div></footer>
<dialog id="modal"><div class="modal-head"><span class="modal-brand">velora / YOUR RIDE</span><button id="modal-close" class="icon-button" aria-label="닫기">${icon("close")}</button></div><div id="modal-body"></div></dialog><div id="toast" role="status"></div>`;
let world: World;
try {
  world = new World($("world"));
  world.setCourse(route);
  world.cameraMode = [0, 1, 2].includes(preferences.cameraMode)
    ? preferences.cameraMode
    : 0;
  $("location-type").textContent = routes[route].label;
  $("location-name").textContent = routes[route].english;
  $("location-subtitle").textContent = routes[route].subtitle;
  $("map-title").textContent = routes[route].name;
} catch (error) {
  $("world").innerHTML =
    '<div class="webgl-error">3D 화면을 시작할 수 없습니다.<br/>브라우저의 하드웨어 가속을 켜고 다시 열어주세요.</div>';
  throw error;
}
const modal = $<HTMLDialogElement>("modal");
function toast(message: string) {
  $("toast").textContent = message;
  $("toast").classList.add("show");
  setTimeout(() => $("toast").classList.remove("show"), 4000);
}
function openModal(content: string) {
  modal.classList.toggle("library-modal", content.includes("training-library"));
  $("modal-body").innerHTML = content;
  if (!modal.open) modal.showModal();
}
$("modal-close").onclick = () => modal.close();
modal.addEventListener("click", (e) => {
  if (e.target === modal) {
    const r = modal.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      modal.close();
  }
});
let readingName = "";
let hadSensorReading = false;
let sensorStatus = "장치를 선택하고 페달을 밟아주세요.";
function status(message: string) {
  sensorStatus = message;
  const el = document.getElementById("connection-status");
  if (el) el.textContent = message;
  $("sensor-name").textContent = message;
}
function receive(reading: Reading) {
  if (
    !Number.isFinite(reading.watts) ||
    reading.watts < 0 ||
    reading.watts > 2500
  )
    return;
  readingName = reading.device;
  hadSensorReading = true;
  watts = reading.watts;
  cadence = reading.cadence;
  trainerHeart = reading.heartRate;
  lastReading = performance.now();
  status(`${reading.device} · 수신 중`);
}
function lost() {
  lastReading = 0;
  watts = 0;
  cadence = null;
  trainerHeart = null;
}
const sensors = new Sensors(receive, status, lost);
const serial = new WebAnt(receive, status, lost);
const control = new TrainerControl(
  async (target) => {
    if (source === "demo")
      return target.mode === "release"
        ? "데모 · 저항 해제"
        : target.mode === "erg"
          ? `데모 · ERG ${target.watts} W`
          : `데모 · SIM ${target.grade.toFixed(1)}%`;
    return source === "serial"
      ? serial.control(target)
      : sensors.control(target);
  },
  (message) => {
    controlStatus = message;
    if (message.startsWith("제어 실패"))
      invalidateRamp("스마트로라 저항 제어 실패");
    $("control-status").textContent = message;
  },
);
function updateControl() {
  const fresh =
      source === "demo" ||
      (lastReading > 0 && performance.now() - lastReading < 3000),
    pedaling = watts > 5 && (cadence === null || cadence > 0),
    step = workoutStep(workout, workoutElapsed);
  control.update(
    chooseTarget({
      running,
      fresh,
      pedaling,
      training: !!step,
      targetWatts: step
        ? Math.round(step.factor * settings.ftp * intensity)
        : 0,
      grade: world.course.grade(distance) * 100,
      weight: settings.weight,
      enabled: autoResistance,
    }),
  );
}
$("control-toggle").onclick = () => {
  invalidateRamp("자동 저항 설정 변경");
  autoResistance = !autoResistance;
  savePreferences({ autoResistance });
  $("control-toggle").textContent =
    `자동 저항 ${autoResistance ? "ON" : "OFF"}`;
  $("control-toggle").setAttribute("aria-pressed", String(autoResistance));
  updateControl();
};
$("intensity-down").onclick = () => {
  if (workout === "ramp") return;
  intensity = Math.max(0.75, Math.round((intensity - 0.05) * 100) / 100);
  render();
  updateControl();
};
$("intensity-up").onclick = () => {
  if (workout === "ramp") return;
  intensity = Math.min(1.25, Math.round((intensity + 0.05) * 100) / 100);
  render();
  updateControl();
};
$("skip-step").onclick = () => {
  if (workout === "ramp") return;
  const step = workoutStep(workout, workoutElapsed);
  if (step) {
    workoutElapsed = step.start + step.seconds;
    completeWorkout();
    render();
    updateControl();
  }
};

async function setSource(next: typeof source) {
  invalidateRamp("파워 장치 변경");
  running = false;
  speed = 0;
  await control.release();
  sensors.disconnect();
  await serial.disconnect();
  source = next;
  readingName = "";
  hadSensorReading = false;
  lost();
  $("demo-control").hidden = source !== "demo";
  $("sensor-footer").hidden = source === "demo";
  $("live-badge").textContent = source === "demo" ? "DEMO" : "SENSOR";
  $("source-label").textContent =
    source === "demo" ? "데모 모드" : source === "ble" ? "Bluetooth" : "ANT+";
  if (source === "demo") {
    watts = demoPower;
    cadence = demoPower ? 82 : 0;
  }
  render();
}
function connections() {
  openModal(
    `<span class="eyebrow orange">CONNECTED TO YOUR RIDE</span><h2>라이딩의 시작, 장치 연결</h2><p class="modal-intro">스마트로라의 실제 파워로 나만의 월드를 달려보세요.</p><div id="device-details" class="device-details" aria-label="연결 장비 상세"></div><div class="connection-options"><button id="choose-demo" class="option"><span>${icon("ride")}</span><div><b>데모 모드</b><small>장비 없이 파워 슬라이더로 주행하기</small></div>${icon("arrow")}</button><button id="choose-serial" class="option"><span>${icon("link")}</span><div><b>ANT+ · 브라우저 직접 연결</b><small>WebANT 기반 · WebUSB 동글 · Chrome / Edge</small></div>${icon("arrow")}</button><button id="choose-ant" class="option"><span>${icon("link")}</span><div><b>ANT+ · USB 브리지 연결</b><small>Garmin USB2 / USB-m · 로컬 브리지 필요</small></div>${icon("arrow")}</button><button id="choose-ble" class="option"><span>${icon("bolt")}</span><div><b>Bluetooth</b><small>FTMS 스마트로라 또는 Cycling Power 파워미터</small></div>${icon("arrow")}</button></div><div class="form-row"><label>ANT+ 장치 프로필<select id="ant-profile"><option value="fec">스마트로라 (FE-C)</option><option value="power">파워미터 (Bicycle Power)</option></select></label><label>장치 번호<input id="ant-id" type="number" min="0" max="65535" value="0"/><small>0 = 첫 번째 감지 장치</small></label></div><p class="connection-status" id="connection-status" role="status"></p><section class="heart-connection"><h3>심박계 · 독립 연결</h3><p>파워 장치와 별도로 Bluetooth 심박계를 연결할 수 있습니다. ANT+ 전용 심박계의 직접 페어링은 아직 지원하지 않습니다.</p><button id="connect-heart" class="secondary">Bluetooth 심박계 연결</button> <button id="disconnect-heart" class="secondary">심박계 해제</button><p id="hr-status" role="status"></p></section><details><summary>ANT+ 연결 도움말</summary><p>USB 브리지: 터미널에서 <code>npm run bridge</code>를 실행한 후 연결하세요. Garmin Express 등 동글을 사용하는 다른 앱을 종료하세요. 직접 연결은 WebANT의 WebUSB 방식으로 Dynastream ANT+ 동글을 엽니다. USB 동글이 선택 목록에 없거나 점유 중이면 브리지를 이용하세요.</p><p>FE-C/FTMS 로라는 자유 주행 시 SIM 경사, 훈련 시 ERG 목표 파워로 제어합니다. 파워미터 전용 장치는 제어할 수 없습니다. ANT+의 전송 확인은 무선 수신 확인이며 실제 저항 적용을 측정한 값은 아닙니다.</p></details>`,
  );
  $("connection-status").textContent = sensorStatus;
  $("hr-status").textContent = hrStatus;
  $("connect-heart").onclick = async () => {
    try {
      await heartSensor.connect();
    } catch (e) {
      $("hr-status").textContent = (e as Error).message;
    }
  };
  $("disconnect-heart").onclick = () => heartSensor.disconnect();
  const saved = readPreferences();
  $<HTMLSelectElement>("ant-profile").value =
    saved.antProfile === "power" ? "power" : "fec";
  $<HTMLInputElement>("ant-id").value = String(
    Number.isInteger(saved.antId) && saved.antId >= 0 && saved.antId <= 65535
      ? saved.antId
      : 0,
  );
  const config = () => {
    const id = Number($<HTMLInputElement>("ant-id").value);
    if (!Number.isInteger(id) || id < 0 || id > 65535)
      throw new Error("장치 번호는 0–65535 사이의 정수입니다.");
    const profile = $<HTMLSelectElement>("ant-profile").value;
    savePreferences({ antProfile: profile, antId: id });
    return { profile, id };
  };
  $("choose-demo").onclick = async () => {
    await setSource("demo");
    modal.close();
    toast("데모 모드 · 슬라이더로 파워를 조절하세요.");
  };
  $("choose-ant").onclick = async () => {
    try {
      const c = config();
      await setSource("ant");
      sensors.ant(c.profile, c.id);
    } catch (e) {
      status((e as Error).message);
    }
  };
  $("choose-serial").onclick = async () => {
    try {
      const c = config();
      await setSource("serial");
      await serial.connect(c.profile, c.id);
    } catch (e) {
      status((e as Error).message);
    }
  };
  $("choose-ble").onclick = async () => {
    await setSource("ble");
    try {
      await sensors.bluetooth();
    } catch (e) {
      status((e as Error).message);
    }
  };
}
$("connect-top").onclick = connections;
for (const chip of document.querySelectorAll<HTMLElement>(".device-chip"))
  chip.onclick = connections;
function showGuide() {
  openModal(guideHtml());
  bindGuide($("modal-body"), () => modal.close());
}
function profile() {
  openModal(
    `<span class="eyebrow orange">PERSONALIZE YOUR RIDE</span><h2>나에게 맞춘 라이딩</h2><p class="modal-intro">체중은 주행 속도에, FTP는 파워 존과 훈련 목표에 반영됩니다.</p><form id="profile-form"><div class="form-row"><label>라이더 체중 (kg)<input id="weight-input" type="number" min="35" max="200" step="0.1" value="${settings.weight}" required/></label><label>FTP (W)<input id="ftp-input" type="number" min="50" max="600" value="${settings.ftp}" required/></label></div><p class="fine-print">자전거 무게 8 kg · 공기 저항과 구름 저항을 포함한 가상 속도</p><button class="primary full" type="submit">설정 저장 ${icon("check")}</button></form><button class="secondary full" id="show-guide">사용 가이드 다시 보기</button>${integrationHtml()}`,
  );
  bindIntegrations($("modal-body"));
  $("show-guide").onclick = showGuide;
  $("profile-form").onsubmit = (e) => {
    e.preventDefault();
    invalidateRamp("라이더 설정 변경");
    settings = {
      weight: Number($<HTMLInputElement>("weight-input").value),
      ftp: Number($<HTMLInputElement>("ftp-input").value),
    };
    try {
      saveSetting("velora-settings", JSON.stringify(settings));
    } catch {
      toast("설정은 이번 세션에만 적용됩니다.");
    }
    modal.close();
    render();
  };
}
$("settings-open").onclick = profile;
$("profile-open").onclick = profile;
function reset() {
  rideId = crypto.randomUUID();
  rideStartedAt = Date.now();
  rampMeasurement = new RampMeasurement();
  rampStopSeconds = 0;
  void control.release();
  workoutElapsed = 0;
  intensity = 1;
  running = false;
  started = false;
  ended = false;
  elapsed = 0;
  distance = 0;
  speed = 0;
  ascent = 0;
  energy = 0;
  samples = [];
  lastSample = -1;
  workoutDone = false;
  render();
}
$("routes-open").onclick = () => {
  openModal(
    `<span class="eyebrow orange">FIND YOUR NEXT HORIZON</span><h2>오늘은 어디로 달릴까요?</h2><p class="modal-intro">${started ? "코스를 변경하면 현재 라이딩이 초기화됩니다. 기록을 먼저 저장하려면 닫은 후 종료하세요." : "해안·설산·공원·협곡·숲·도심, 여섯 가지 라이딩."}</p><div class="course-list">${Object.entries(
      routes,
    )
      .map(
        ([key, r], i) =>
          `<button class="course-option ${key === route ? "selected" : ""}" data-route="${key}"><span class="course-art course-${key}">${icon("mountain")}</span><div><small>0${i + 1} / ${r.label}</small><b>${r.name}</b><p>${r.subtitle}</p><span>${r.difficulty} ${key === route ? "· 선택됨" : ""}</span></div>${icon("arrow")}</button>`,
      )
      .join("")}</div>`,
  );
  document.querySelectorAll<HTMLButtonElement>("[data-route]").forEach(
    (b) =>
      (b.onclick = () => {
        route = b.dataset.route as RouteKey;
        savePreferences({ route });
        world.setCourse(route);
        reset();
        $("location-name").textContent = routes[route].english;
        $("location-subtitle").textContent = routes[route].subtitle;
        $("map-title").textContent = routes[route].name;
        $("location-type").textContent = routes[route].english;
        modal.close();
        toast(`${routes[route].name}에서 새로운 라이딩을 시작하세요.`);
      }),
  );
};
function openTraining() {
  // Keep all ramp targets inside the controller's supported 1,000 W limit.
  workouts.ramp.steps = [
    {
      label: "워밍업",
      seconds: 300,
      factor: 0.46,
      cadenceLow: 80,
      cadenceHigh: 95,
    },
    ...Array.from({ length: 26 }, (_, i) => ({
      label: `램프 ${i + 1}`,
      seconds: 60,
      factor: Math.round((0.52 + i * 0.06) * 100) / 100,
      cadenceLow: 80,
      cadenceHigh: 95,
    })).filter((s) => s.factor * settings.ftp <= 1000),
  ];
  openModal(libraryHtml(settings.ftp, workout, started));
  let selected = workout;
  const editor = (key?: string) => {
    if (running) {
      invalidateRamp("훈련 편집 중 일시정지");
      running = false;
      speed = 0;
      void control.release();
      render();
    }
    mountEditor($("modal-body"), key, (id) => {
      if (id && id === workout) {
        reset();
        $("workout-name").textContent = workouts[workout].name;
        $("workout-description").textContent = workouts[workout].detail;
      }
      openTraining();
      if (id)
        document
          .querySelector<HTMLButtonElement>(`[data-plan="${id}"]`)
          ?.click();
    });
  };
  $("create-workout").onclick = () => editor();
  const details = (key: string) => {
    selected = key;
    $("plan-detail").innerHTML = detailHtml(key, settings.ftp);
    document
      .querySelectorAll<HTMLElement>("[data-plan]")
      .forEach((el) =>
        el.classList.toggle("selected", el.dataset.plan === key),
      );
    if (key.startsWith("custom-"))
      $("edit-workout").onclick = () => editor(key);
    $("apply-plan").onclick = () => {
      workout = selected;
      savePreferences({ workout });
      reset();
      $("workout-name").textContent = workouts[workout].name;
      $("workout-description").textContent = workouts[workout].detail;
      $("workout-blocks").innerHTML = workoutBars(workout, settings.ftp);
      modal.close();
      render();
    };
  };
  document
    .querySelectorAll<HTMLButtonElement>("[data-plan]")
    .forEach(
      (button) => (button.onclick = () => details(button.dataset.plan!)),
    );
  document.querySelectorAll<HTMLButtonElement>("[data-filter]").forEach(
    (button) =>
      (button.onclick = () => {
        document
          .querySelectorAll("[data-filter]")
          .forEach((el) => el.classList.toggle("active", el === button));
        document
          .querySelectorAll<HTMLElement>("[data-plan]")
          .forEach(
            (el) =>
              (el.hidden =
                button.dataset.filter !== "전체" &&
                el.dataset.category !== button.dataset.filter),
          );
      }),
  );
  details(selected);
}
$("workout-open").onclick = openTraining;
$("training-open").onclick = openTraining;
function completeWorkout() {
  if (
    workout !== "free" &&
    workoutElapsed >= workoutDuration(workout) &&
    !workoutDone
  ) {
    if (workout === "ramp") {
      rampMeasurement.invalidate("테스트 상한 도달 · 더 긴 평가가 필요합니다");
      finishRide();
      return;
    }
    workoutDone = true;
    running = false;
    speed = 0;
    void control.release();
    toast("훈련 완료 · 부하 해제 요청. 제어 상태 확인 후 기록을 저장하세요.");
    finishRide();
  }
}
function toggleRide() {
  if (workoutDone) {
    openTraining();
    return;
  }
  if (ended) reset();
  if (workout === "ramp") {
    if (source === "demo")
      rampMeasurement.invalidate("데모 결과는 FTP에 적용할 수 없습니다");
    if (!autoResistance)
      rampMeasurement.invalidate("자동 저항이 꺼져 있습니다");
    if (running) rampMeasurement.invalidate("테스트 일시정지");
  }
  if (!started) rideStartedAt = Date.now();
  started = true;
  running = !running;
  if (!running) {
    speed = 0;
    void control.release();
  } else updateControl();
  render();
}
$("start").onclick = toggleRide;
function exportCsv() {
  const csv =
    "seconds,power_w,cadence_rpm,heart_rate_bpm,distance_m,speed_kmh,source\n" +
    samples
      .map(
        (s) =>
          `${s.seconds},${s.watts},${s.cadence ?? ""},${s.heartRate ?? ""},${s.distance.toFixed(2)},${s.speed.toFixed(2)},${s.source}`,
      )
      .join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  a.download = `velora-${source}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function finishRide() {
  if (ended) return;
  running = false;
  speed = 0;
  void control.release();
  ended = true;
  render();
  openModal(
    `<span class="eyebrow orange">A LITTLE FURTHER, A LITTLE STRONGER</span><h2>오늘도 한 걸음 더 달렸어요.</h2><p class="modal-intro">${routes[route].name} · ${source === "demo" ? "데모 라이딩" : "센서 라이딩"} · ${escapeHtml(workouts[workout].name)}</p>${workout === "ramp" ? `<section class="ramp-result"><span class="eyebrow orange">RAMP TEST RESULT ${source === "demo" ? "· DEMO" : ""}</span><h3>추정 FTP <strong>${rampMeasurement.best ? rampMeasurement.ftp : "—"} W</strong></h3><p>최고 60초 실측 평균 ${rampMeasurement.best ? Math.round(rampMeasurement.best) + " W × 75%" : "데이터 부족"} · 현재 FTP ${settings.ftp} W</p><p>${escapeHtml(rampMeasurement.reason || (rampMeasurement.eligible ? "추정치에는 개인차가 있습니다. 한계까지 수행한 테스트만 적용하세요." : "워밍업 이후 연속 60초 이상의 유효 파워 기록이 필요합니다."))}</p><label><input type="checkbox" id="ramp-exhausted" ${rampMeasurement.eligible ? "" : "disabled"}/> 목표 파워를 더 이상 유지할 수 없어 테스트를 종료했습니다.</label><button class="primary full" id="apply-ftp" disabled>이 결과를 내 FTP에 적용</button></section>` : ""}<div class="summary-grid"><div><small>주행 거리</small><b>${(distance / 1000).toFixed(2)}<em>km</em></b></div><div><small>라이딩 시간</small><b>${formatTime(elapsed)}</b></div><div><small>평균 파워</small><b>${elapsed ? Math.round((energy * 1000) / elapsed) : 0}<em>W</em></b></div><div><small>획득 고도</small><b>${Math.round(ascent)}<em>m</em></b></div></div><button id="export" class="primary full">${icon("download")} 라이딩 기록 다운로드 (CSV)</button><button id="new-ride" class="secondary full">새 라이딩 시작하기</button><p class="fine-print">기록은 1초 간격으로 저장됩니다. 새로고침 전에 다운로드하세요.</p>`,
  );
  if (workout === "ramp") {
    $("ramp-exhausted").onchange = () => {
      $<HTMLButtonElement>("apply-ftp").disabled =
        !rampMeasurement.eligible ||
        !$<HTMLInputElement>("ramp-exhausted").checked;
    };
    $("apply-ftp").onclick = () => {
      if (
        !rampMeasurement.eligible ||
        !$<HTMLInputElement>("ramp-exhausted").checked
      )
        return;
      settings.ftp = rampMeasurement.ftp;
      try {
        saveSetting("velora-settings", JSON.stringify(settings));
        toast(`FTP ${settings.ftp} W 저장 완료`);
      } catch {
        toast("FTP는 이번 세션에만 적용됩니다.");
      }
      $("apply-ftp").textContent = `FTP ${settings.ftp} W 적용 완료`;
      $<HTMLButtonElement>("apply-ftp").disabled = true;
      $<HTMLInputElement>("ramp-exhausted").disabled = true;
      render();
    };
  }
  attachActivity($("modal-body"), {
    id: rideId,
    startedAt: rideStartedAt,
    duration: elapsed,
    distance,
    ascent,
    energy,
    ftp: settings.ftp,
    source,
    workout: workouts[workout].name,
    route: routes[route].name,
    samples: [...samples],
  });
  $("export").onclick = exportCsv;
  $("new-ride").onclick = () => {
    reset();
    modal.close();
  };
}
$("finish").onclick = finishRide;
$<HTMLInputElement>("demo-power").oninput = (e) => {
  demoPower = Number((e.target as HTMLInputElement).value);
  $("demo-value").textContent = `${demoPower} W`;
  if (source === "demo") {
    watts = demoPower;
    cadence = watts ? Math.round(65 + watts * 0.1) : 0;
    render();
  }
};
$("camera").onclick = () => {
  world.cameraMode = (world.cameraMode + 1) % 3;
  savePreferences({ cameraMode: world.cameraMode });
  toast(["추적 카메라", "와이드 카메라", "사이드 카메라"][world.cameraMode]);
};
$("fullscreen").onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    toast("현재 브라우저에서는 전체 화면을 사용할 수 없습니다.");
  }
};
document.addEventListener("keydown", (e) => {
  if (
    modal.open ||
    ["INPUT", "SELECT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)
  )
    return;
  if (e.code === "Space") {
    e.preventDefault();
    toggleRide();
  }
  if (e.code === "KeyC") $("camera").click();
  if (
    source === "demo" &&
    (e.code === "ArrowLeft" || e.code === "ArrowRight")
  ) {
    e.preventDefault();
    const slider = $<HTMLInputElement>("demo-power");
    slider.value = String(
      Math.max(
        0,
        Math.min(500, demoPower + (e.code === "ArrowRight" ? 10 : -10)),
      ),
    );
    slider.dispatchEvent(new Event("input"));
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) invalidateRamp("화면 비활성화로 테스트 중단");
  if (document.hidden && running) {
    running = false;
    speed = 0;
    void control.release();
    render();
    toast("화면을 벗어나 라이딩을 일시정지했습니다.");
  }
});
window.addEventListener("pagehide", () => {
  running = false;
  void control.release();
});
window.addEventListener("beforeunload", (e) => {
  if (started && !ended && elapsed > 5) {
    e.preventDefault();
  }
});
function drawMap() {
  const c = $<HTMLCanvasElement>("minimap"),
    ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, c.width, c.height);
  const points = world.course.curve.getSpacedPoints(180);
  const xs = points.map((p) => p.x),
    zs = points.map((p) => p.z),
    minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minZ = Math.min(...zs),
    maxZ = Math.max(...zs),
    scale = Math.min(420 / (maxX - minX), 240 / (maxZ - minZ));
  const xy = (p: { x: number; z: number }) => [
    (p.x - (minX + maxX) / 2) * scale + 260,
    (p.z - (minZ + maxZ) / 2) * scale + 165,
  ];
  ctx.strokeStyle = "#ffffff08";
  ctx.lineWidth = 1;
  for (let i = 0; i < 520; i += 35) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 330);
    ctx.stroke();
  }
  for (let i = 0; i < 330; i += 35) {
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(520, i);
    ctx.stroke();
  }
  ctx.beginPath();
  points.forEach((p, i) => {
    const [x, y] = xy(p);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = "#506b6535";
  ctx.fill();
  ctx.lineWidth = 14;
  ctx.strokeStyle = "#8da89d22";
  ctx.stroke();
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#a4bcb1";
  ctx.stroke();
  const [sx, sy] = xy(world.course.point(0));
  ctx.fillStyle = "#edf6e7";
  ctx.fillRect(sx - 4, sy - 4, 8, 8);
  const [x, y] = xy(world.course.point(distance / world.course.length));
  ctx.shadowBlur = 18;
  ctx.shadowColor = "#ff8459";
  ctx.fillStyle = "#ff8459";
  ctx.beginPath();
  ctx.arc(x, y, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#fff";
  ctx.stroke();
  ctx.font = "16px sans-serif";
  ctx.fillStyle = "#a9beb6";
  ctx.fillText("N ↑", 465, 32);
}
function drawChart() {
  const c = $<HTMLCanvasElement>("power-chart"),
    ctx = c.getContext("2d")!,
    rect = c.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width)),
    height = rect.height;
  c.width = width * 2;
  c.height = height * 2;
  ctx.scale(2, 2);
  ctx.clearRect(0, 0, width, height);
  for (let i = 1; i < 4; i++) {
    ctx.strokeStyle = "#ffffff09";
    ctx.beginPath();
    ctx.moveTo(0, (height * i) / 4);
    ctx.lineTo(width, (height * i) / 4);
    ctx.stroke();
  }
  const data = samples.slice(-120);
  const dx = width / 120;
  data.forEach((s, i) => {
    ctx.fillStyle = zoneColors[zone(s.watts, settings.ftp) - 1];
    const h = Math.min(height - 4, (s.watts / 500) * (height - 4));
    ctx.globalAlpha = 0.8;
    ctx.fillRect(i * dx, height - h, Math.max(1, dx - 1), h);
  });
  ctx.globalAlpha = 1;
  if (!data.length) {
    ctx.fillStyle = "#93a59d";
    ctx.font = "11px sans-serif";
    ctx.fillText(
      "페달을 밟으면 당신의 라이딩이 여기에 그려집니다.",
      10,
      height / 2 + 4,
    );
  }
}
function renderDevices() {
  const adapter = source === "serial" ? serial : sensors;
  const badges = deviceBadges({
    demo: source === "demo",
    linked: adapter.linkConnected,
    name: readingName || adapter.deviceName,
    kind: adapter.deviceKind,
    fresh:
      source !== "demo" &&
      lastReading > 0 &&
      performance.now() - lastReading < 3000,
    hadReading: hadSensorReading,
    cadence,
    trainerHeart,
    heartConnected: heartSensor.connected,
    heartValue: heartSensor.value,
    heartName: heartSensor.name,
    canControl: adapter.canControl,
    controlError: controlStatus.startsWith("제어 실패"),
    controlStatus,
  });
  for (const b of badges) {
    const el = $("device-" + b.id);
    el.dataset.state = b.state;
    const text = el.querySelector("b")!;
    if (text.textContent !== b.text) text.textContent = b.text;
    el.title = b.detail;
    el.setAttribute(
      "aria-label",
      `${b.label}: ${b.text}. ${b.detail}. 클릭하여 장치 연결`,
    );
  }
  const details = document.getElementById("device-details");
  if (details) {
    const html = badges
      .map(
        (b) =>
          `<div data-state="${b.state}"><b>${b.label} · ${b.text}</b><span>${escapeHtml(b.detail)}</span></div>`,
      )
      .join("");
    if (details.innerHTML !== html) details.innerHTML = html;
  }
  $("connect-top").dataset.state = source === "demo" ? "demo" : badges[0].state;
}
function render() {
  renderDevices();
  $("speed").textContent = (speed * 3.6).toFixed(1);
  $("distance").textContent = (distance / 1000).toFixed(2);
  $("ascent").textContent = Math.round(ascent).toString();
  $("time").textContent = formatTime(elapsed);
  $("watts").textContent = Math.round(watts).toString();
  $("wkg").textContent = (watts / settings.weight).toFixed(2);
  $("rider-wkg").innerHTML =
    `${(watts / settings.weight).toFixed(1)} <small>W/kg</small>`;
  $("cadence").textContent =
    cadence === null ? "—" : Math.round(cadence).toString();
  $("heart").textContent =
    heartRate === null ? "—" : Math.round(heartRate).toString();
  const z = zone(watts, settings.ftp);
  $("zone").textContent =
    `Z${z} · ${["회복", "지구력", "템포", "역치", "VO₂", "무산소"][z - 1]}`;
  $("zone").style.color = zoneColors[z - 1];
  document
    .querySelectorAll<HTMLElement>("[data-zone]")
    .forEach(
      (e) => (e.style.opacity = Number(e.dataset.zone) === z ? "1" : ".25"),
    );
  const gradePercent = world.course.grade(distance) * 100;
  $("grade").textContent = (
    Math.abs(gradePercent) < 0.05 ? 0 : gradePercent
  ).toFixed(1);
  $("route-length").textContent =
    `${(world.course.length / 1000).toFixed(2)} km · ↑ ${Math.round(world.course.ascent)} m`;
  $("lap").textContent =
    `LAP ${String(1 + Math.floor(distance / world.course.length)).padStart(2, "0")}`;
  $("progress").style.width =
    `${((distance % world.course.length) / world.course.length) * 100}%`;
  $("avg-power").textContent = String(
    elapsed ? Math.round((energy * 1000) / elapsed) : 0,
  );
  $("energy").textContent = String(Math.round(energy));
  $("start").innerHTML =
    `${icon(running ? "pause" : "play")}<span>${running ? "일시정지" : ended ? "새 라이딩" : started ? "계속 달리기" : "라이딩 시작"}</span>`;
  $<HTMLButtonElement>("finish").disabled = !started || ended;
  $("ride-prompt").classList.toggle("riding", running);
  $("prompt-text").textContent = ended
    ? "멋진 라이딩이었어요"
    : started
      ? "잠시 숨을 고르는 중"
      : "새로운 라이딩이 기다리고 있어요";
  $("prompt-sub").textContent = started
    ? "준비되면 계속 달리기를 눌러주세요"
    : "라이딩 시작을 누르고 페달을 밟아보세요";
  const step = workoutStep(workout, workoutElapsed);
  $("workout-phase").textContent = step
    ? `${step.label} · ${formatTime(step.remaining).slice(3)}`
    : workout === "free"
      ? "JUST KEEP PEDALING"
      : "훈련 완료 · 저항 해제";
  $("target").textContent = step
    ? `${Math.round(step.factor * settings.ftp * intensity)} W 목표`
    : "FREE RIDE";
  $("workout-name").textContent = workouts[workout].name;
  $("workout-description").textContent = workouts[workout].detail;
  $("control-toggle").textContent =
    `자동 저항 ${autoResistance ? "ON" : "OFF"}`;
  $("control-toggle").setAttribute("aria-pressed", String(autoResistance));
  $("training-hud").hidden = workout === "free";
  $("training-adjust").hidden = workout === "free";
  for (const id of ["intensity-down", "intensity-up", "skip-step"])
    $<HTMLButtonElement>(id).disabled = workout === "ramp";

  document.body.classList.toggle("training-mode", workout !== "free");
  if (workout !== "free")
    $("training-hud").innerHTML = trainingHud(
      workout,
      workoutElapsed,
      settings.ftp,
      intensity,
      cadence,
      trainingWaiting || !running,
    );
  $("intensity-label").textContent =
    `${Math.round(intensity * 100)}% 훈련 강도`;
  $("control-status").textContent = controlStatus;
  $("workout-blocks").innerHTML = workoutBars(
    workout,
    settings.ftp * intensity,
    workoutElapsed,
  );
  drawMap();
  drawChart();
}
let previous = performance.now(),
  ui = 0,
  controlTick = 0;
function frame(now: number) {
  if (running && now - previous > 1500) invalidateRamp("테스트 기록 중단");
  const dt = Math.min((now - previous) / 1000, 0.1);
  previous = now;
  if (source !== "demo" && (!lastReading || now - lastReading > 3000)) {
    watts = 0;
    cadence = null;
    trainerHeart = null;
    if (lastReading)
      status("센서 신호가 없습니다 · 페달과 연결 상태를 확인하세요.");
  }
  heartRate = heartSensor.connected ? heartSensor.value : trainerHeart;
  if (running && workout === "ramp") {
    if (source !== "demo" && (!lastReading || now - lastReading > 3000))
      rampMeasurement.invalidate("파워 센서 신호 끊김");
    if (workoutElapsed >= 300) {
      rampMeasurement.add(watts, dt);
      rampStopSeconds = watts <= 5 || cadence === 0 ? rampStopSeconds + dt : 0;
      if (rampStopSeconds >= 2) finishRide();
    }
  }
  if (running) {
    const grade = world.course.grade(distance);
    speed = nextSpeed(
      speed,
      watts,
      settings.weight + 8,
      grade,
      dt,
      world.course.cornerLimit(distance),
    );
    const advance = speed * dt;
    distance += advance;
    ascent += Math.max(0, (advance * grade) / Math.sqrt(1 + grade * grade));
    elapsed += dt;
    trainingWaiting =
      workout !== "free" &&
      (watts <= 5 ||
        cadence === 0 ||
        (source !== "demo" && (!lastReading || now - lastReading > 3000)));
    if (workout !== "free" && !trainingWaiting)
      workoutElapsed = Math.min(workoutDuration(workout), workoutElapsed + dt);
    energy += (watts * dt) / 1000;
    if (Math.floor(elapsed) > lastSample) {
      lastSample = Math.floor(elapsed);
      samples.push({
        seconds: lastSample,
        recordedAt: Date.now(),
        watts: Math.round(watts),
        cadence,
        heartRate,
        distance,
        speed: speed * 3.6,
        source,
      });
    }
    completeWorkout();
  }
  if (now - controlTick > 1000) {
    updateControl();
    controlTick = now;
  }
  world.update(
    distance,
    speed,
    running ? (cadence ?? (watts > 0 ? 80 : 0)) : 0,
    running ? dt : 0,
    elapsed,
    running && cadence !== null ? watts : 0,
    settings.ftp,
  );
  if (now - ui > 150) {
    render();
    ui = now;
  }
  requestAnimationFrame(frame);
}
render();
requestAnimationFrame(frame);

if (needsGuide()) showGuide();
if ((import.meta as any).env.PROD && "serviceWorker" in navigator)
  navigator.serviceWorker.register("./sw.js").catch(() => {});
