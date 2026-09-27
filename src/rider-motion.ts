/** Visual inference only: power/cadence cannot establish the rider's actual posture. */
export class StandingMotion {
  blend = 0;
  private sustained = 0;
  private standing = false;
  update(dt: number, power: number, cadence: number, ftp: number) {
    const torque = cadence > 0 ? power / ((cadence * Math.PI) / 30) : 0;
    if (cadence > 25 && cadence < 65 && torque > 40 && power >= ftp * 0.85)
      this.sustained += dt;
    else this.sustained = 0;
    if (this.sustained >= 1.2) this.standing = true;
    if (cadence <= 25 || cadence > 75 || torque < 30 || power < ftp * 0.65)
      this.standing = false;
    this.blend +=
      ((this.standing ? 1 : 0) - this.blend) * (1 - Math.exp(-dt * 3));
    return this.blend;
  }
}
