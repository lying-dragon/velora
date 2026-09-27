export type TrainerTarget =
  | { mode: "sim"; grade: number; weight: number }
  | { mode: "erg"; watts: number; weight: number }
  | { mode: "release" };
export function validateTarget(target: TrainerTarget): TrainerTarget {
  if (target.mode === "release") return target;
  if (
    !Number.isFinite(target.weight) ||
    target.weight < 35 ||
    target.weight > 200
  )
    throw new Error("체중 설정 오류");
  if (target.mode === "erg") {
    if (
      !Number.isFinite(target.watts) ||
      target.watts < 0 ||
      target.watts > 1000
    )
      throw new Error("ERG 목표는 0–1000 W 범위여야 합니다.");
    return { ...target, watts: Math.round(target.watts) };
  }
  if (!Number.isFinite(target.grade) || Math.abs(target.grade) > 20)
    throw new Error("경사 제어 범위는 ±20%입니다.");
  return { ...target, grade: Math.round(target.grade * 100) / 100 };
}
export function ftmsPacket(target: TrainerTarget): Uint8Array {
  validateTarget(target);
  if (target.mode === "release") return new Uint8Array([0x08, 0x01]); // Stop fitness machine, maintaining the connection.
  if (target.mode === "erg") {
    const a = new Uint8Array(3);
    a[0] = 5;
    new DataView(a.buffer).setInt16(1, target.watts, true);
    return a;
  }
  const a = new Uint8Array(7),
    v = new DataView(a.buffer);
  a[0] = 0x11;
  v.setInt16(1, 0, true);
  v.setInt16(3, Math.round(target.grade * 100), true);
  a[5] = 40;
  a[6] = 39;
  return a;
}
export function fecPacket(target: TrainerTarget): Uint8Array {
  validateTarget(target);
  const a = new Uint8Array(8).fill(255),
    v = new DataView(a.buffer);
  if (target.mode === "release") {
    a[0] = 48;
    a[7] = 0;
  } else if (target.mode === "erg") {
    a[0] = 49;
    v.setUint16(6, Math.round(target.watts * 4), true);
  } else {
    a[0] = 51;
    v.setUint16(5, Math.round((target.grade + 200) * 100), true);
    a[7] = 80;
  }
  return a;
}
export function fecUser(weight: number) {
  const a = new Uint8Array(8).fill(255);
  a[0] = 55;
  new DataView(a.buffer).setUint16(1, Math.round(weight * 100), true);
  a[4] = 15;
  a[5] = 10; // 8 kg bike: encoded 160 split between byte 4 high nibble and byte 5.
  a[6] = 70;
  a[7] = 0;
  return a;
}
export function fecWind() {
  return new Uint8Array([50, 255, 255, 255, 255, 39, 127, 100]);
}
export function chooseTarget(args: {
  running: boolean;
  fresh: boolean;
  pedaling: boolean;
  training: boolean;
  targetWatts: number;
  grade: number;
  weight: number;
  enabled: boolean;
}): TrainerTarget {
  if (!args.running || !args.fresh || !args.pedaling || !args.enabled)
    return { mode: "release" };
  return args.training
    ? { mode: "erg", watts: args.targetWatts, weight: args.weight }
    : {
        mode: "sim",
        grade: Math.max(-20, Math.min(20, args.grade)),
        weight: args.weight,
      };
}
/** A single in-flight command and a latest-wins mailbox. Stop overwrites queued targets. */
export class TrainerControl {
  private desired: TrainerTarget = { mode: "release" };
  private pending = false;
  private dirty = false;
  private previous: TrainerTarget = { mode: "release" };
  private lastSent = 0;
  private lastError = -Infinity;
  private failure = "";
  private waiters: (() => void)[] = [];
  constructor(
    private send: (t: TrainerTarget) => Promise<string>,
    private report: (s: string) => void,
  ) {}
  update(target: TrainerTarget, now = performance.now()) {
    if (target.mode !== "release" && now - this.lastError < 5000) return;
    // Smooth load increases. Emergency release is immediate, never ramped.
    let next = validateTarget(target);
    const seconds = Math.min(2, Math.max(0.1, (now - this.lastSent) / 1000));
    if (next.mode === "erg") {
      const from =
        this.previous.mode === "erg"
          ? this.previous.watts
          : Math.min(80, next.watts);
      next = {
        ...next,
        watts: Math.round(
          Math.max(
            from - 50 * seconds,
            Math.min(from + 25 * seconds, next.watts),
          ),
        ),
      };
    }
    if (next.mode === "sim") {
      const from = this.previous.mode === "sim" ? this.previous.grade : 0;
      next = {
        ...next,
        grade: Math.max(
          from - 2 * seconds,
          Math.min(from + 2 * seconds, next.grade),
        ),
      };
    }
    if (
      JSON.stringify(next) === JSON.stringify(this.desired) &&
      (this.pending || next.mode === "release" || now - this.lastSent < 1800)
    )
      return;
    this.desired = next;
    this.dirty = true;
    void this.pump();
  }
  async release() {
    this.desired = { mode: "release" };
    this.dirty = true;
    const done = new Promise<void>((resolve) => this.waiters.push(resolve));
    void this.pump();
    await done;
  }
  private async pump() {
    if (this.pending) return;
    this.pending = true;
    try {
      while (this.dirty) {
        this.dirty = false;
        const target = this.desired;
        try {
          const result = await this.send(target);
          this.previous = target;
          this.lastSent = performance.now();
          if (target.mode !== "release") this.failure = "";
          this.report(this.failure ? `${this.failure} · ${result}` : result);
        } catch (error) {
          this.lastError = performance.now();
          this.previous = { mode: "release" };
          this.failure = `제어 실패 · ${(error as Error).message}`;
          this.report(this.failure);
          if (target.mode !== "release") {
            this.desired = { mode: "release" };
            this.dirty = true;
          }
        }
      }
    } finally {
      this.pending = false;
      this.waiters.splice(0).forEach((resolve) => resolve());
    }
  }
}
