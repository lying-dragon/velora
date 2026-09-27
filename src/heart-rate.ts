/** Bluetooth Heart Rate Measurement 0x2A37, flags and optional UINT16 BPM. */
export function parseHeartRate(view: DataView): number | null {
  if (view.byteLength < 2) return null;
  const flags = view.getUint8(0);
  if (flags & 4 && !(flags & 2)) return null;
  if (flags & 1 && view.byteLength < 3) return null;
  const bpm = flags & 1 ? view.getUint16(1, true) : view.getUint8(1);
  return bpm > 0 && bpm <= 300 ? bpm : null;
}
export class HeartRateSensor {
  private device: any;
  private characteristic: any;
  private received = 0;
  private bpm: number | null = null;
  connected = false;
  get name(): string {
    return this.device?.name || "Bluetooth 심박계";
  }
  constructor(private report: (message: string) => void) {}
  get value() {
    return this.connected && performance.now() - this.received < 5000
      ? this.bpm
      : null;
  }
  private reading = (event: any) => {
    this.bpm = parseHeartRate(event.target.value);
    this.received = performance.now();
    this.report(
      this.bpm === null
        ? "심박 신호 / 피부 접촉 확인"
        : `심박계 · ${this.bpm} bpm`,
    );
  };
  private lost = () => {
    this.connected = false;
    this.bpm = null;
    this.report("심박계 연결 끊김");
  };
  async connect() {
    const bluetooth = (navigator as any).bluetooth;
    if (!bluetooth)
      throw new Error("Bluetooth 심박계는 Chrome / Edge에서 연결하세요.");
    const device = await bluetooth.requestDevice({
      filters: [{ services: ["heart_rate"] }],
    });
    this.disconnect();
    this.device = device;
    device.addEventListener("gattserverdisconnected", this.lost);
    try {
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService("heart_rate");
      this.characteristic = await service.getCharacteristic(
        "heart_rate_measurement",
      );
      this.characteristic.addEventListener(
        "characteristicvaluechanged",
        this.reading,
      );
      await this.characteristic.startNotifications();
      this.connected = true;
      this.report("심박계 연결됨 · 신호 대기");
    } catch (e) {
      this.disconnect();
      throw e;
    }
  }
  disconnect() {
    this.characteristic?.removeEventListener(
      "characteristicvaluechanged",
      this.reading,
    );
    this.device?.removeEventListener("gattserverdisconnected", this.lost);
    this.device?.gatt?.disconnect();
    this.characteristic = null;
    this.device = null;
    this.connected = false;
    this.bpm = null;
    this.received = 0;
    this.report("별도 심박계 미연결");
  }
}
