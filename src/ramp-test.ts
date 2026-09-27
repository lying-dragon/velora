/** Time-weighted rolling 60 s of measured power, independent of frame rate. */
export class RampMeasurement {
  private window: { power: number; seconds: number }[] = [];
  private duration = 0;
  private energy = 0;
  best = 0;
  measured = 0;
  reason = "";
  invalidate(reason: string) {
    this.reason ||= reason;
  }
  add(power: number, seconds: number) {
    if (
      !Number.isFinite(power) ||
      power < 0 ||
      !Number.isFinite(seconds) ||
      seconds <= 0
    )
      return;
    this.window.push({ power, seconds });
    this.duration += seconds;
    this.energy += power * seconds;
    this.measured += seconds;
    while (this.duration > 60 + 1e-9) {
      const first = this.window[0],
        remove = Math.min(first.seconds, this.duration - 60);
      this.energy -= first.power * remove;
      this.duration -= remove;
      first.seconds -= remove;
      if (first.seconds < 1e-9) this.window.shift();
    }
    if (this.duration >= 60 - 1e-6)
      this.best = Math.max(this.best, this.energy / 60);
  }
  get ftp() {
    return Math.round(this.best * 0.75);
  }
  get eligible() {
    return (
      !this.reason && this.measured >= 60 && this.ftp >= 50 && this.ftp <= 600
    );
  }
}
