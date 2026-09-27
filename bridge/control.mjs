// FE-C control policies shared by the USB bridge lifecycle and regression tests.
export function validateControl(t) {
  if (!t || !["release", "erg", "sim"].includes(t.mode))
    throw new Error("지원하지 않는 제어 모드");
  if (t.mode === "release") return;
  if (!Number.isFinite(t.weight) || t.weight < 35 || t.weight > 200)
    throw new Error("잘못된 체중");
  if (
    t.mode === "erg" &&
    (!Number.isFinite(t.watts) || t.watts < 0 || t.watts > 1000)
  )
    throw new Error("ERG 범위 0–1000 W");
  if (t.mode === "sim" && (!Number.isFinite(t.grade) || Math.abs(t.grade) > 20))
    throw new Error("SIM 경사 범위 ±20%");
}
export function sendToTrainer(sensor, method, ...args) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("ANT+ 제어 전송 시간 초과")),
      1800,
    );
    try {
      sensor[method](...args, (ok) => {
        clearTimeout(timer);
        ok ? resolve() : reject(new Error("ANT+ 전송 실패"));
      });
    } catch (e) {
      clearTimeout(timer);
      reject(e);
    }
  });
}
export async function applyControl(sensor, t) {
  validateControl(t);
  if (t.mode === "release") {
    await sendToTrainer(sensor, "setBasicResistance", 0);
    return "저항 해제 전송 확인";
  }
  await sendToTrainer(sensor, "setUserConfiguration", t.weight, 8, 70, 3);
  if (t.mode === "erg") await sendToTrainer(sensor, "setTargetPower", t.watts);
  else {
    await sendToTrainer(sensor, "setWindResistance", 0.39, 0, 1);
    await sendToTrainer(sensor, "setTrackResistance", t.grade, 0.004);
  }
  return t.mode === "erg"
    ? `ERG ${t.watts} W · 전송 확인`
    : `SIM ${t.grade.toFixed(1)}% · 전송 확인`;
}
