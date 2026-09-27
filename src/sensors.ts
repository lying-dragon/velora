import {
  ftmsPacket,
  validateTarget,
  type TrainerTarget,
} from "./trainer-control";
export type Reading = {
  watts: number;
  cadence: number | null;
  heartRate: number | null;
  device: string;
};
export function parseCyclingPower(view: DataView): Omit<Reading, "device"> {
  if (view.byteLength < 4) throw new Error("잘못된 Cycling Power 패킷");
  return {
    watts: Math.max(0, view.getInt16(2, true)),
    cadence: null,
    heartRate: null,
  };
}
export function parseIndoorBike(
  view: DataView,
): Omit<Reading, "device"> | null {
  if (view.byteLength < 2) return null;
  const flags = view.getUint16(0, true);
  let offset = 2,
    cadence = null,
    watts = null,
    heartRate = null;
  const skip = (n: number) => {
    offset += n;
  };
  if (!(flags & 1)) skip(2);
  if (flags & 2) skip(2);
  if (flags & 4) {
    if (offset + 2 > view.byteLength) return null;
    cadence = view.getUint16(offset, true) / 2;
    skip(2);
  }
  if (flags & 8) skip(2);
  if (flags & 16) skip(3);
  if (flags & 32) skip(2);
  if (flags & 64) {
    if (offset + 2 > view.byteLength) return null;
    watts = Math.max(0, view.getInt16(offset, true));
    skip(2);
  }
  if (flags & 128) skip(2);
  if (flags & 256) skip(5);
  if (flags & 512) {
    if (offset + 1 > view.byteLength) return null;
    heartRate = view.getUint8(offset);
  }
  return watts === null ? null : { watts, cadence, heartRate };
}
export class Sensors {
  deviceKind: "trainer" | "power" | "unknown" = "unknown";
  deviceName = "";
  get linkConnected() {
    return !!this.ble?.gatt?.connected || this.socket?.readyState === 1;
  }
  get canControl() {
    return (
      this.linkConnected &&
      (this.socket ? this.deviceKind === "trainer" : !!this.controlPoint)
    );
  }
  private controlPoint: any = null;
  private controlResponse: ((v: DataView) => void) | null = null;
  private cancelControl: (() => void) | null = null;
  private bridgeResponse: ((d: any) => void) | null = null;
  private controlListener = (e: any) => this.controlResponse?.(e.target.value);
  private features = 0;
  private hasControl = false;
  private machineStarted = false;
  private serial = 0;
  private powerRange = { min: 0, max: 1000, step: 1 };
  private socket: WebSocket | null = null;
  private ble: any = null;
  private characteristic: any = null;
  private generation = 0;
  private onNotification = ((event: any) => {}) as (event: any) => void;
  constructor(
    private reading: (data: Reading) => void,
    private status: (message: string) => void,
    private disconnected: () => void,
  ) {}
  disconnect() {
    this.deviceKind = "unknown";
    this.deviceName = "";
    this.cancelControl?.();
    this.hasControl = false;
    this.machineStarted = false;
    this.features = 0;
    this.controlPoint?.removeEventListener(
      "characteristicvaluechanged",
      this.controlListener,
    );
    this.controlPoint = null;
    this.generation++;
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.close();
      this.socket = null;
    }
    if (this.characteristic) {
      this.characteristic.removeEventListener(
        "characteristicvaluechanged",
        this.onNotification,
      );
      this.characteristic = null;
    }
    if (this.ble) {
      this.ble.gatt?.disconnect();
      this.ble = null;
    }
  }
  ant(profile: string, deviceId: number) {
    this.disconnect();
    const generation = this.generation;
    this.deviceKind = profile === "fec" ? "trainer" : "power";
    this.deviceName = `ANT+ ${profile === "fec" ? "FE-C 로라" : "파워미터"} · ${deviceId || "자동 검색"}`;
    const ws = new WebSocket("ws://127.0.0.1:18765");
    this.socket = ws;
    this.status("ANT+ 브리지에 연결 중…");
    ws.onopen = () =>
      ws.send(JSON.stringify({ type: "connect", profile, deviceId }));
    ws.onmessage = (e) => {
      if (generation !== this.generation) return;
      try {
        const d = JSON.parse(e.data);
        if (d.type === "control-result") this.bridgeResponse?.(d);
        else if (d.type === "reading") this.reading(d);
        else if (d.type === "status") this.status(d.message);
      } catch {
        this.status("브리지 데이터 오류");
      }
    };
    ws.onerror = () => {
      if (generation === this.generation)
        this.status(
          "브리지 연결 실패 · 터미널에서 npm run bridge를 실행하세요.",
        );
    };
    ws.onclose = () => {
      if (generation === this.generation) {
        this.status("ANT+ 브리지 연결 종료");
        this.disconnected();
      }
    };
  }
  async bluetooth() {
    const bluetooth = (navigator as any).bluetooth;
    if (!bluetooth)
      throw new Error(
        "이 브라우저는 Bluetooth를 지원하지 않습니다. Chrome에서 localhost를 열어주세요.",
      );
    this.disconnect();
    const generation = this.generation;
    const device = await bluetooth.requestDevice({
      filters: [{ services: [0x1826] }, { services: [0x1818] }],
      optionalServices: [0x1826, 0x1818],
    });
    if (generation !== this.generation) return;
    this.ble = device;
    device.addEventListener("gattserverdisconnected", () => {
      if (generation === this.generation) {
        this.status("Bluetooth 연결이 끊겼습니다.");
        this.disconnected();
      }
    });
    const server = await device.gatt.connect();
    let c: any;
    let ftms = true;
    let service: any;
    try {
      service = await server.getPrimaryService(0x1826);
      c = await service.getCharacteristic(0x2ad2);
    } catch {
      ftms = false;
      c = await (
        await server.getPrimaryService(0x1818)
      ).getCharacteristic(0x2a63);
    }
    if (generation !== this.generation) {
      device.gatt.disconnect();
      return;
    }
    this.deviceKind = ftms ? "trainer" : "power";
    this.deviceName =
      device.name || (ftms ? "Bluetooth 로라" : "Bluetooth 파워미터");
    this.characteristic = c;
    this.onNotification = (e: any) => {
      if (generation !== this.generation) return;
      try {
        const parsed = ftms
          ? parseIndoorBike(e.target.value)
          : parseCyclingPower(e.target.value);
        if (parsed)
          this.reading({
            ...parsed,
            device: device.name || "Bluetooth 파워미터",
          });
      } catch {
        this.status("센서 패킷을 읽을 수 없습니다.");
      }
    };
    c.addEventListener("characteristicvaluechanged", this.onNotification);
    await c.startNotifications();
    if (ftms) {
      try {
        const feature = await (
          await service.getCharacteristic(0x2acc)
        ).readValue();
        if (feature.byteLength >= 8) this.features = feature.getUint32(4, true);
        this.controlPoint = await service.getCharacteristic(0x2ad9);
        this.controlPoint.addEventListener(
          "characteristicvaluechanged",
          this.controlListener,
        );
        await this.controlPoint.startNotifications();
        if (this.features & 8) {
          const range = await (
            await service.getCharacteristic(0x2ad8)
          ).readValue();
          if (range.byteLength >= 6)
            this.powerRange = {
              min: Math.max(0, range.getInt16(0, true)),
              max: Math.min(1000, range.getInt16(2, true)),
              step: Math.max(1, range.getUint16(4, true)),
            };
        }
      } catch {
        this.features = 0;
        this.controlPoint = null;
      }
    }
    this.status(
      `${device.name || "Bluetooth"} 연결됨 · ${this.controlPoint ? "자동 저항 사용 가능" : "파워 수신 전용"} · 페달을 밟아주세요`,
    );
  }
  async control(target: TrainerTarget): Promise<string> {
    validateTarget(target);
    if (this.socket) {
      const ws = this.socket,
        id = ++this.serial;
      if (ws.readyState !== WebSocket.OPEN) {
        if (target.mode === "release") return "브리지 대기";
        throw new Error("브리지가 연결되지 않았습니다.");
      }
      return await new Promise<string>((resolve, reject) => {
        const finish = (error?: Error, message = "") => {
          clearTimeout(timer);
          this.bridgeResponse = null;
          this.cancelControl = null;
          error ? reject(error) : resolve(message);
        };
        const timer = setTimeout(
          () => finish(new Error("브리지 제어 응답 시간 초과")),
          2500,
        );
        this.cancelControl = () => finish(new Error("연결 변경"));
        this.bridgeResponse = (d) => {
          if (d.id === id)
            finish(d.ok ? undefined : new Error(d.message), d.message);
        };
        ws.send(JSON.stringify({ type: "control", id, target }));
      });
    }
    if (!this.controlPoint) {
      if (target.mode === "release") return "저항 제어 대기";
      throw new Error("이 Bluetooth 장치는 저항 제어를 지원하지 않습니다.");
    }
    if (target.mode === "release") {
      if (!this.hasControl || !this.machineStarted) return "저항 해제";
      await this.ftmsWrite(ftmsPacket(target));
      this.machineStarted = false;
      return "FTMS 정지 확인";
    }
    if (target.mode === "erg" && !(this.features & 8))
      throw new Error("이 로라는 FTMS ERG를 지원하지 않습니다.");
    if (target.mode === "sim" && !(this.features & (1 << 13)))
      throw new Error("이 로라는 FTMS 경사 시뮬레이션을 지원하지 않습니다.");
    if (
      target.mode === "erg" &&
      (target.watts < this.powerRange.min || target.watts > this.powerRange.max)
    )
      throw new Error(
        `로라 파워 범위 ${this.powerRange.min}–${this.powerRange.max} W를 벗어났습니다.`,
      );
    if (!this.hasControl) {
      await this.ftmsWrite(new Uint8Array([0]));
      this.hasControl = true;
    }
    const applied =
      target.mode === "erg"
        ? {
            ...target,
            watts: Math.min(
              this.powerRange.max,
              Math.max(
                this.powerRange.min,
                this.powerRange.min +
                  Math.round(
                    (target.watts - this.powerRange.min) / this.powerRange.step,
                  ) *
                    this.powerRange.step,
              ),
            ),
          }
        : target;
    await this.ftmsWrite(ftmsPacket(applied));
    if (!this.machineStarted) {
      await this.ftmsWrite(new Uint8Array([7]));
      this.machineStarted = true;
    }
    return applied.mode === "erg"
      ? `ERG ${applied.watts} W · 로라 응답 확인`
      : `SIM ${applied.grade.toFixed(1)}% · 로라 응답 확인`;
  }
  private ftmsWrite(bytes: Uint8Array) {
    return new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => {
        clearTimeout(timer);
        this.controlResponse = null;
        this.cancelControl = null;
        error ? reject(error) : resolve();
      };
      const timer = setTimeout(
        () => finish(new Error("FTMS 응답 시간 초과")),
        1800,
      );
      this.cancelControl = () => finish(new Error("Bluetooth 연결 변경"));
      this.controlResponse = (v) => {
        if (
          v.byteLength >= 3 &&
          v.getUint8(0) === 0x80 &&
          v.getUint8(1) === bytes[0]
        ) {
          const result = v.getUint8(2);
          if (result === 5) this.hasControl = false;
          finish(
            result === 1 ? undefined : new Error(`FTMS 명령 거절 (${result})`),
          );
        }
      };
      this.controlPoint
        .writeValueWithResponse(bytes)
        .catch((error: Error) => finish(error));
    });
  }
}
