import type { Page } from "@playwright/test";
export async function usbTrainer(page: Page) {
  await page.addInitScript(() => {
    const state = ((window as any).__trainer = {
      writes: [] as number[][],
      power: 200,
      cadence: 85,
      transmit: true,
      ack: true,
    });
    let pending: ((v: any) => void) | undefined, timer: number;
    const queue: any[] = [];
    const frame = (id: number, data: number[]) => {
      const a = [164, data.length, id, ...data];
      return new Uint8Array([...a, a.reduce((x, y) => x ^ y, 0)]);
    };
    const push = (bytes: Uint8Array) => {
      const v = { status: "ok", data: new DataView(bytes.buffer) };
      if (pending) {
        const resolve = pending;
        pending = undefined;
        resolve(v);
      } else queue.push(v);
    };
    const alt = {
      alternateSetting: 0,
      endpoints: [
        { direction: "in", type: "bulk", endpointNumber: 1, packetSize: 64 },
        { direction: "out", type: "bulk", endpointNumber: 1, packetSize: 64 },
      ],
    };
    const device = {
      configuration: {
        interfaces: [{ interfaceNumber: 0, alternates: [alt] }],
      },
      open: async () => {},
      claimInterface: async () => {},
      selectAlternateInterface: async () => {},
      close: async () => clearInterval(timer),
      transferIn: async () =>
        queue.shift() || new Promise((resolve) => (pending = resolve)),
      transferOut: async (_ep: number, bytes: Uint8Array) => {
        const id = bytes[2];
        state.writes.push(Array.from(bytes));
        push(id === 0x4a ? frame(0x6f, [0]) : frame(0x40, [0, id, 0]));
        if (id === 0x4f) push(frame(0x40, [0, 1, state.ack ? 5 : 6]));
        if (id === 0x4b) {
          timer = window.setInterval(() => {
            if (state.transmit)
              push(
                frame(0x4e, [
                  0,
                  25,
                  1,
                  state.cadence,
                  0,
                  0,
                  state.power & 255,
                  state.power >> 8,
                  0,
                ]),
              );
          }, 100);
        }
        return { status: "ok" };
      },
    };
    Object.defineProperty(navigator, "usb", {
      value: { requestDevice: async () => device },
      configurable: true,
    });
  });
}
export async function bleTrainer(page: Page, features = 8200) {
  await page.addInitScript(
    ({ features }) => {
      const state = ((window as any).__ble = {
        writes: [] as number[][],
        power: 200,
        cadence: 85,
        accept: true,
      });
      const listeners = new Map<string, ((e: any) => void)[]>();
      const response = (a: number[]) => ({
        target: { value: new DataView(new Uint8Array(a).buffer) },
      });
      const cp = {
        addEventListener: (_n: string, fn: any) =>
          listeners.set("cp", [...(listeners.get("cp") ?? []), fn]),
        removeEventListener: () => listeners.delete("cp"),
        startNotifications: async () => {},
        writeValueWithResponse: async (a: Uint8Array) => {
          state.writes.push(Array.from(a));
          for (const fn of listeners.get("cp") ?? [])
            fn(response([128, a[0], state.accept ? 1 : 5]));
        },
      };
      const data = {
        addEventListener: (_n: string, fn: any) => listeners.set("data", [fn]),
        removeEventListener: () => listeners.delete("data"),
        startNotifications: async () => {
          setInterval(() => {
            for (const fn of listeners.get("data") ?? [])
              fn(
                response([
                  0x44,
                  0,
                  0,
                  0,
                  state.cadence * 2,
                  0,
                  state.power & 255,
                  state.power >> 8,
                ]),
              );
          }, 100);
        },
      };
      const service = {
        getCharacteristic: async (uuid: number) => {
          if (uuid === 0x2ad2) return data;
          if (uuid === 0x2ad9) return cp;
          if (uuid === 0x2acc)
            return {
              readValue: async () => {
                const a = new DataView(new ArrayBuffer(8));
                a.setUint32(4, features, true);
                return a;
              },
            };
          if (uuid === 0x2ad8)
            return {
              readValue: async () =>
                new DataView(new Uint8Array([0, 0, 232, 3, 1, 0]).buffer),
            };
          throw Error("unsupported");
        },
      };
      const device = {
        name: "Mock FTMS",
        addEventListener: () => {},
        gatt: {
          connect: async () => ({ getPrimaryService: async () => service }),
          disconnect: () => {},
        },
      };
      Object.defineProperty(navigator, "bluetooth", {
        value: { requestDevice: async () => device },
        configurable: true,
      });
    },
    { features },
  );
}
