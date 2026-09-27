/** ANT framing and channel configuration adapted from dvmarinoff/WebANT (AGPL-3.0).
 * See docs/ATTRIBUTION.md. Added streaming resynchronization and invalid-value filtering.
 */
// @ts-expect-error Vendored, unmodified upstream JavaScript codec.
import { fec } from "./vendor/webant/fec.js";
export function antFrame(id: number, payload: number[]): Uint8Array {
  const bytes = [0xa4, payload.length, id, ...payload];
  return new Uint8Array([...bytes, bytes.reduce((a, b) => a ^ b, 0)]);
}
export class AntFramer {
  private buffer: number[] = [];
  push(chunk: Uint8Array): Uint8Array[] {
    this.buffer.push(...chunk);
    const messages: Uint8Array[] = [];
    while (this.buffer.length >= 4) {
      if (this.buffer[0] !== 0xa4) {
        this.buffer.shift();
        continue;
      }
      if (this.buffer[1] > 64) {
        this.buffer.shift();
        continue;
      }
      const length = this.buffer[1] + 4;
      if (this.buffer.length < length) break;
      const frame = this.buffer.slice(0, length);
      if (frame.reduce((a, b) => a ^ b, 0) !== 0) {
        this.buffer.shift();
        continue;
      }
      this.buffer.splice(0, length);
      messages.push(new Uint8Array(frame));
    }
    return messages;
  }
}
export const antProfiles = {
  fec: { type: 17, period: 8192 },
  power: { type: 11, period: 8182 },
};
export function channelCommands(
  profile: "fec" | "power",
  deviceId: number,
): [number, number[]][] {
  const p = antProfiles[profile];
  return [
    [0x46, [0, 0xb9, 0xa5, 0x21, 0xfb, 0xbd, 0x72, 0xc3, 0x45]],
    [0x42, [0, 0, 0]],
    [0x51, [0, deviceId & 255, deviceId >> 8, p.type, 0]],
    [0x45, [0, 57]],
    [0x43, [0, p.period & 255, p.period >> 8]],
    [0x44, [0, 255]],
    [0x4b, [0]],
  ];
}
export function decodeAntPayload(
  profile: string,
  bytes: Uint8Array,
): {
  watts?: number;
  cadence?: number | null;
  heartRate?: number | null;
} | null {
  if (bytes.length < 8) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, 8);
  if (profile === "fec") {
    if (bytes[0] === 25) {
      const data = fec.decode(view);
      return {
        watts: data.power === 0xfff ? undefined : data.power,
        cadence: bytes[2] === 255 ? null : data.cadence,
      };
    }
    if (bytes[0] === 16) {
      const data = fec.decode(view);
      return {
        heartRate: bytes[6] === 255 || bytes[6] === 0 ? null : data.heartRate,
      };
    }
  } else if (profile === "power" && bytes[0] === 16) {
    const p = view.getUint16(6, true);
    return {
      watts: p === 65535 ? undefined : p,
      cadence: bytes[3] === 255 ? null : bytes[3],
    };
  }
  return null;
}
