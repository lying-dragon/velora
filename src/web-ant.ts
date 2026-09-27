/** WebANT-based ANT+ transport: USB bulk endpoints (macOS/Android), serial fallback.
 * Channel profiles and FE-C decoder come from WebANT; transport lifecycle rewritten.
 * AGPL-3.0; see docs/ATTRIBUTION.md.
 */
import {
  antFrame,
  AntFramer,
  channelCommands,
  decodeAntPayload,
} from "./ant-protocol";
import {
  fecPacket,
  fecUser,
  fecWind,
  type TrainerTarget,
} from "./trainer-control";
import type { Reading } from "./sensors";
export class WebAnt {
  get linkConnected() {
    return this.ready;
  }
  get deviceKind(): "trainer" | "power" {
    return this.profile === "fec" ? "trainer" : "power";
  }
  get deviceName() {
    return `ANT+ ${this.profile === "fec" ? "FE-C 로라" : "파워미터"}`;
  }
  get canControl() {
    return this.ready && this.profile === "fec";
  }
  private profile = "power";
  private ready = false;
  private controlWeight = 0;
  private transfer: ((frame: Uint8Array) => void) | null = null;
  private transferCancel: (() => void) | null = null;
  private device: any = null;
  private port: any = null;
  private reader: any = null;
  private writer: any = null;
  private endpointOut = 0;
  private active = false;
  private generation = 0;
  private pending: ((frame: Uint8Array) => void) | null = null;
  private cleanup: Promise<void> = Promise.resolve();
  constructor(
    private reading: (r: Reading) => void,
    private status: (s: string) => void,
    private lost: () => void,
  ) {}
  async disconnect() {
    this.ready = false;
    this.controlWeight = 0;
    this.transferCancel?.();
    this.generation++;
    this.active = false;
    this.pending = null;
    const device = this.device,
      port = this.port,
      reader = this.reader,
      writer = this.writer;
    this.device = null;
    this.port = null;
    this.reader = null;
    this.writer = null;
    const previousCleanup = this.cleanup;
    const endpointOut = this.endpointOut;
    this.cleanup = (async () => {
      await previousCleanup;
      if (device) {
        try {
          await device.transferOut(endpointOut, antFrame(0x4c, [0]));
        } catch {}
        try {
          await device.close();
        } catch {}
      }
      if (port) {
        try {
          await reader?.cancel();
        } catch {}
        try {
          reader?.releaseLock();
          writer?.releaseLock();
          await port.close();
        } catch {}
      }
    })();
    await this.cleanup;
  }
  async connect(profile: string, deviceId: number) {
    await this.disconnect();
    this.profile = profile;
    const gen = this.generation;
    const nav = navigator as any;
    if (!nav.usb && !nav.serial)
      throw new Error(
        "WebANT 연결에는 Chrome 또는 Edge의 WebUSB / Web Serial 지원이 필요합니다.",
      );
    let selected: any;
    try {
      this.status("WebANT · ANT+ USB 동글을 선택하세요");
      if (nav.usb) {
        selected = await nav.usb.requestDevice({
          filters: [{ vendorId: 0x0fcf }],
        });
        if (gen !== this.generation) return;
        this.device = selected;
        await selected.open();
        if (!selected.configuration) await selected.selectConfiguration(1);
        let found: any = null;
        for (const iface of selected.configuration.interfaces)
          for (const alt of iface.alternates) {
            const input = alt.endpoints.find(
              (e: any) => e.direction === "in" && e.type === "bulk",
            );
            const output = alt.endpoints.find(
              (e: any) => e.direction === "out" && e.type === "bulk",
            );
            if (input && output) {
              found = { iface, alt, input, output };
              break;
            }
          }
        if (!found)
          throw new Error(
            "지원되는 ANT+ bulk USB 인터페이스를 찾을 수 없습니다. USB 브리지를 이용하세요.",
          );
        await selected.claimInterface(found.iface.interfaceNumber);
        await selected.selectAlternateInterface(
          found.iface.interfaceNumber,
          found.alt.alternateSetting,
        );
        this.endpointOut = found.output.endpointNumber;
        this.active = true;
        void this.readUsb(
          selected,
          found.input.endpointNumber,
          found.input.packetSize,
          profile,
          deviceId,
          gen,
        );
      } else {
        const port = await nav.serial.requestPort({
          filters: [{ usbVendorId: 0x0fcf }],
        });
        if (gen !== this.generation) return;
        this.port = port;
        await port.open({ baudRate: 115200 });
        this.writer = port.writable.getWriter();
        this.reader = port.readable.getReader();
        this.active = true;
        void this.readSerial(profile, deviceId, gen);
      }
      await this.command(0x4a, [0], 0x6f); // Await actual startup, not a fixed delay.
      for (const [id, payload] of channelCommands(
        profile === "power" ? "power" : "fec",
        deviceId,
      )) {
        if (gen !== this.generation) return;
        await this.command(id, payload);
      }
      this.ready = true;
      this.status(
        `WebANT · ${profile === "fec" ? "FE-C 로라" : "파워미터"} 검색 중 · 페달을 밟아주세요`,
      );
    } catch (error) {
      if (gen === this.generation) await this.disconnect();
      throw error;
    }
  }
  async control(target: TrainerTarget): Promise<string> {
    if (!this.ready || this.profile !== "fec") {
      if (target.mode === "release") return "저항 제어 대기";
      throw new Error(
        "FE-C 스마트로라를 연결하세요. 파워미터는 저항을 제어할 수 없습니다.",
      );
    }
    if (target.mode !== "release" && this.controlWeight !== target.weight) {
      await this.transmit(fecUser(target.weight));
      await this.transmit(fecWind());
      this.controlWeight = target.weight;
    }
    await this.transmit(fecPacket(target));
    return target.mode === "release"
      ? "저항 해제 전송 확인"
      : target.mode === "erg"
        ? `ERG ${target.watts} W · 전송 확인`
        : `SIM ${target.grade.toFixed(1)}% · 전송 확인`;
  }
  private transmit(page: Uint8Array) {
    return new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => {
        clearTimeout(timer);
        this.transfer = null;
        this.transferCancel = null;
        error ? reject(error) : resolve();
      };
      const timer = setTimeout(
        () => finish(new Error("ANT+ 제어 전송 시간 초과")),
        1800,
      );
      this.transferCancel = () => finish(new Error("ANT+ 연결 변경"));
      this.transfer = (frame) => {
        if (frame[2] !== 0x40 || frame[3] !== 0) return;
        if (frame[4] === 1 && frame[5] === 5) finish();
        else if (frame[4] === 1 && frame[5] === 6)
          finish(new Error("로라가 ANT+ 명령을 수신하지 못했습니다."));
        else if (frame[4] === 0x4f && frame[5] !== 0)
          finish(new Error(`ANT+ 제어 거절 (${frame[5]})`));
      };
      void this.write(antFrame(0x4f, [0, ...page])).catch((error) =>
        finish(error),
      );
    });
  }
  private async write(bytes: Uint8Array) {
    if (this.device) {
      const result = await this.device.transferOut(this.endpointOut, bytes);
      if (result.status !== "ok") throw new Error("ANT+ USB 쓰기 실패");
    } else if (this.writer) await this.writer.write(bytes);
    else throw new Error("ANT+ 연결이 종료되었습니다.");
  }
  private async command(id: number, payload: number[], expected?: number) {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending = null;
        reject(new Error("ANT+ 응답 시간 초과 · 동글을 다시 연결하세요."));
      }, 3000);
      this.pending = (frame) => {
        if (
          expected
            ? frame[2] === expected
            : frame[2] === 0x40 && frame[4] === id
        ) {
          clearTimeout(timeout);
          this.pending = null;
          if (!expected && frame[5] !== 0)
            reject(new Error(`ANT+ 설정 오류 (${frame[5]})`));
          else resolve();
        }
      };
      void this.write(antFrame(id, payload)).catch((e) => {
        clearTimeout(timeout);
        this.pending = null;
        reject(e);
      });
    });
  }
  private receiver(profile: string, deviceId: number) {
    const framer = new AntFramer();
    let cadence: number | null = null,
      heartRate: number | null = null;
    return (bytes: Uint8Array) => {
      for (const frame of framer.push(bytes)) {
        this.pending?.(frame);
        this.transfer?.(frame);
        if (
          frame[2] === 0x40 &&
          frame[4] === 1 &&
          (frame[5] === 1 || frame[5] === 7)
        ) {
          this.status("ANT+ 센서 검색이 종료되었습니다. 다시 연결하세요.");
          this.lost();
        }
        if ((frame[2] !== 0x4e && frame[2] !== 0x4f) || frame[3] !== 0)
          continue;
        const data = decodeAntPayload(profile, frame.subarray(4, 12));
        if (!data) continue;
        if (data.cadence !== undefined) cadence = data.cadence;
        if (data.heartRate !== undefined) heartRate = data.heartRate;
        if (data.watts !== undefined)
          this.reading({
            watts: data.watts,
            cadence,
            heartRate,
            device: `WebANT ${profile.toUpperCase()} · ${deviceId || "자동 연결"}`,
          });
      }
    };
  }
  private async readUsb(
    device: any,
    endpoint: number,
    packetSize: number,
    profile: string,
    id: number,
    gen: number,
  ) {
    const receive = this.receiver(profile, id);
    try {
      while (this.active && gen === this.generation) {
        const result = await device.transferIn(
          endpoint,
          Math.max(64, packetSize),
        );
        if (gen !== this.generation) return;
        if (result.status !== "ok") throw new Error("USB 읽기 오류");
        if (result.data)
          receive(
            new Uint8Array(
              result.data.buffer,
              result.data.byteOffset,
              result.data.byteLength,
            ),
          );
      }
    } catch {
      if (gen === this.generation) {
        this.status("ANT+ USB 동글 연결이 끊겼습니다.");
        this.lost();
        void this.disconnect();
      }
    }
  }
  private async readSerial(profile: string, id: number, gen: number) {
    const receive = this.receiver(profile, id);
    try {
      while (this.active && gen === this.generation) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (gen === this.generation && value) receive(value);
      }
    } catch {
    } finally {
      if (gen === this.generation) {
        this.status("ANT+ 시리얼 연결이 끊겼습니다.");
        this.lost();
        void this.disconnect();
      }
    }
  }
}
