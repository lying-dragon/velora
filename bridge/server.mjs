import { applyControl, validateControl } from "./control.mjs";
import { WebSocketServer, WebSocket } from "ws";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const server = new WebSocketServer({
  host: "127.0.0.1",
  port: 18765,
  maxPayload: 2048,
  verifyClient: ({ origin }) => {
    try {
      const u = new URL(origin);
      return (
        ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) &&
        ["http:", "https:"].includes(u.protocol)
      );
    } catch {
      return false;
    }
  },
});
let owner = null;
server.on("connection", (ws) => {
  let lastPowerEvent = undefined;
  let profile = "power",
    attached = false,
    lastControl = 0,
    lastPower = 0,
    controlBusy = false;
  let desired = null;
  async function pumpControl() {
    if (controlBusy || !desired || !sensor) return;
    controlBusy = true;
    try {
      while (desired && sensor) {
        const { target, id } = desired;
        desired = null;
        try {
          const message = await applyControl(sensor, target);
          if (id !== null)
            send({ type: "control-result", id, ok: true, message });
        } catch (e) {
          if (id !== null)
            send({ type: "control-result", id, ok: false, message: e.message });
          if (target.mode !== "release")
            desired = { target: { mode: "release" }, id: null };
        }
      }
    } finally {
      controlBusy = false;
    }
  }
  function release() {
    if (profile === "fec" && attached) {
      desired = { target: { mode: "release" }, id: null };
      void pumpControl();
    }
  }
  const watchdog = setInterval(() => {
    if (
      lastControl &&
      (Date.now() - lastControl > 5000 || Date.now() - lastPower > 4000)
    ) {
      lastControl = 0;
      release();
    }
  }, 500);

  let stick = null,
    sensor = null,
    busy = false;
  const send = (data) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
  };
  const status = (message) => send({ type: "status", message });
  const close = () => {
    clearInterval(watchdog);
    const closingStick = stick;
    stick = null;
    attached = false;
    try {
      closingStick?.close();
    } catch {}
    sensor = null;
    busy = false;
    if (owner === ws) owner = null;
  };
  ws.on("message", (raw) => {
    try {
      const d = JSON.parse(raw.toString());
      if (d.type === "control") {
        try {
          validateControl(d.target);
          if (owner !== ws || profile !== "fec" || !attached)
            throw new Error("FE-C 로라 연결이 필요합니다.");
          if (d.target.mode !== "release" && Date.now() - lastPower > 3000)
            throw new Error("유효한 파워 신호가 없습니다.");
          if (desired?.id !== null && desired?.id !== undefined)
            send({
              type: "control-result",
              id: desired.id,
              ok: false,
              message: "새 제어 명령으로 대체됨",
            });
          desired = { target: d.target, id: d.id };
          lastControl = d.target.mode === "release" ? 0 : Date.now();
          void pumpControl();
        } catch (e) {
          send({
            type: "control-result",
            id: d.id,
            ok: false,
            message: e.message,
          });
        }
        return;
      }

      if (
        d.type !== "connect" ||
        !["fec", "power"].includes(d.profile) ||
        !Number.isInteger(d.deviceId) ||
        d.deviceId < 0 ||
        d.deviceId > 65535
      )
        throw new Error("잘못된 연결 설정");
      if (owner && owner !== ws)
        throw new Error("다른 라이딩 창이 동글을 사용 중입니다.");
      if (busy || stick)
        throw new Error(
          "이미 연결 중입니다. 창에서 데모 모드를 선택한 후 다시 연결하세요.",
        );
      const Ant = require("ant-plus");
      owner = ws;
      busy = true;
      for (const Class of [Ant.GarminStick3, Ant.GarminStick2]) {
        const candidate = new Class();
        if (candidate.is_present()) {
          stick = candidate;
          break;
        }
      }
      if (!stick) {
        close();
        status(
          "ANT+ USB 동글을 찾지 못했습니다. USB 연결과 다른 앱의 점유 상태를 확인하세요.",
        );
        return;
      }
      profile = d.profile;
      sensor =
        d.profile === "fec"
          ? new Ant.FitnessEquipmentSensor(stick)
          : new Ant.BicyclePowerSensor(stick);
      sensor.on(d.profile === "fec" ? "fitnessData" : "powerData", (state) => {
        // ant-plus retains old power on general FE pages. Only fresh trainer
        // event counts may refresh the browser's power watchdog.
        if (d.profile === "fec") {
          if (
            state._EventCount0x19 === undefined ||
            state._EventCount0x19 === lastPowerEvent
          )
            return;
          lastPowerEvent = state._EventCount0x19;
        }
        const watts =
          d.profile === "fec"
            ? state.InstantaneousPower
            : (state.Power ?? state.CalculatedPower);
        if (
          !Number.isFinite(watts) ||
          watts < 0 ||
          watts > 2500 ||
          watts === 4095
        )
          return;
        lastPower = Date.now();
        send({
          type: "reading",
          watts,
          cadence:
            Number.isFinite(state.Cadence) && state.Cadence < 255
              ? state.Cadence
              : null,
          heartRate:
            Number.isFinite(state.HeartRate) &&
            state.HeartRate > 0 &&
            state.HeartRate < 255
              ? state.HeartRate
              : null,
          device: `ANT+ ${d.profile.toUpperCase()} #${state.DeviceID}`,
        });
      });
      sensor.on("attached", () => {
        attached = true;
        status("ANT+ 채널 준비됨 · 페달을 밟아주세요");
      });
      stick.on("startup", () => {
        busy = false;
        sensor.attach(0, d.deviceId);
      });
      stick.on("shutdown", () => {
        status("ANT+ USB 동글 연결 종료");
        close();
      });
      stick.on("error", (e) => {
        status(`ANT+ 오류: ${e.message}`);
        close();
      });
      if (!stick.open()) {
        close();
        status(
          "동글을 열 수 없습니다. Garmin Express 등 다른 앱을 종료하세요.",
        );
      } else status("ANT+ 동글 초기화 중…");
    } catch (e) {
      if (!stick) close();
      status(
        e.code === "MODULE_NOT_FOUND"
          ? "ant-plus가 설치되지 않았습니다. npm install을 실행하세요."
          : e.message,
      );
    }
  });
  async function shutdown() {
    clearInterval(watchdog);
    release();
    const deadline = Date.now() + 6000;
    while (controlBusy && Date.now() < deadline)
      await new Promise((r) => setTimeout(r, 50));
    close();
  }
  ws.on("close", () => void shutdown());
  ws.on("error", () => void shutdown());
});
server.on("error", (e) => {
  console.error(`브리지 실행 실패: ${e.message}`);
  process.exitCode = 1;
});
console.log(
  "VELORA ANT+ bridge · ws://127.0.0.1:18765 · FE-C SIM / ERG control",
);
