export type DeviceState =
  "live" | "waiting" | "stale" | "off" | "demo" | "error";
export type DeviceBadge = {
  id: string;
  label: string;
  state: DeviceState;
  text: string;
  detail: string;
};
export type DeviceSnapshot = {
  demo: boolean;
  linked: boolean;
  name: string;
  kind: "trainer" | "power" | "unknown";
  fresh: boolean;
  hadReading: boolean;
  cadence: number | null;
  trainerHeart: number | null;
  heartConnected: boolean;
  heartValue: number | null;
  heartName: string;
  canControl: boolean;
  controlError: boolean;
  controlStatus: string;
};
export function deviceBadges(s: DeviceSnapshot): DeviceBadge[] {
  const base: DeviceState = s.demo
    ? "demo"
    : s.fresh
      ? "live"
      : s.linked
        ? s.hadReading
          ? "stale"
          : "waiting"
        : "off";
  const labels: Record<DeviceState, string> = {
    live: "수신 중",
    waiting: "신호 대기",
    stale: "신호 없음",
    off: "미연결",
    demo: "데모",
    error: "제어 오류",
  };
  const badge = (
    id: string,
    label: string,
    state: DeviceState,
    detail: string,
    text = labels[state],
  ): DeviceBadge => ({ id, label, state, text, detail });
  const name = s.name || "파워 장치";
  const power = badge(
    "power",
    "파워",
    base,
    s.demo ? "가상 파워 · 실제 장비 미연결" : `${name} · ${labels[base]}`,
  );
  const cadence = badge(
    "cadence",
    "케이던스",
    s.demo
      ? "demo"
      : s.fresh && s.cadence !== null
        ? "live"
        : s.fresh
          ? "off"
          : base,
    s.demo
      ? "가상 케이던스"
      : `${name}에서 전달받는 케이던스 · 별도 케이던스 센서 직접 연결은 미지원`,
    s.fresh && s.cadence === null ? "미제공" : undefined,
  );
  const heart = s.heartConnected
    ? badge(
        "heart",
        "심박",
        s.heartValue !== null ? "live" : "waiting",
        `${s.heartName} · ${s.heartValue !== null ? "연결·수신 중" : "연결됨 · 신호/접촉 확인"}`,
      )
    : s.fresh && s.trainerHeart !== null
      ? badge("heart", "심박", "live", `${name}가 중계하는 심박`)
      : badge("heart", "심박", "off", "별도 심박계 미연결 · 중계 심박 없음");
  const trainer = s.demo
    ? badge("trainer", "로라", "demo", "가상 저항 · 실제 장비 미연결")
    : s.kind !== "trainer"
      ? badge(
          "trainer",
          "로라",
          "off",
          "로라 미연결 · 파워미터는 저항 제어 불가",
        )
      : badge(
          "trainer",
          "로라",
          s.controlError ? "error" : base,
          `${name} · ${s.controlStatus} · 실제 저항 적용을 측정한 확인은 아닙니다.`,
          s.fresh
            ? s.controlError
              ? "제어 오류"
              : s.canControl
                ? "제어 가능"
                : "수신 전용"
            : undefined,
        );
  return [power, heart, cadence, trainer];
}
