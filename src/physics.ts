// SI units throughout: speed m/s, power W, mass kg, grade rise/run.
export const physics = {
  g: 9.80665,
  rho: 1.225,
  cda: 0.32,
  crr: 0.004,
  efficiency: 0.97,
  rotatingMass: 1.5,
};
export function resistanceForce(speed: number, mass: number, grade: number) {
  const theta = Math.atan(grade);
  return (
    mass * physics.g * (Math.sin(theta) + physics.crr * Math.cos(theta)) +
    0.5 * physics.rho * physics.cda * speed * speed
  );
}
export function requiredPower(speed: number, mass: number, grade: number) {
  return Math.max(
    0,
    (resistanceForce(speed, mass, grade) * speed) / physics.efficiency,
  );
}
export function equilibriumSpeed(watts: number, mass: number, grade: number) {
  let lo = 0,
    hi = 40;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (requiredPower(mid, mass, grade) > watts) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}
export function nextSpeed(
  speed: number,
  watts: number,
  mass: number,
  grade: number,
  dt: number,
  cornerLimit = Infinity,
): number {
  if (
    ![speed, watts, mass, grade, dt].every(Number.isFinite) ||
    mass < 20 ||
    dt < 0
  )
    return 0;
  let v = Math.max(0, speed),
    remaining = Math.min(dt, 2);
  const power = Math.max(0, Math.min(2500, watts));
  while (remaining > 1e-8) {
    const h = Math.min(0.02, remaining);
    const acceleration = (x: number) =>
      (Math.min(180, (power * physics.efficiency) / Math.max(x, 0.5)) -
        resistanceForce(x, mass, grade)) /
      (mass + physics.rotatingMass);
    const mid = Math.max(0, v + (acceleration(v) * h) / 2);
    let a = acceleration(mid);
    if (v > cornerLimit) a = Math.min(a, Math.max(-3, (cornerLimit - v) / h));
    v = Math.max(0, v + a * h);
    remaining -= h;
  }
  return v;
}
export function formatTime(seconds: number): string {
  const s = Math.floor(seconds);
  return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
export function zone(watts: number, ftp: number): number {
  const ratio = watts / ftp;
  return ratio < 0.55
    ? 1
    : ratio < 0.76
      ? 2
      : ratio < 0.91
        ? 3
        : ratio < 1.06
          ? 4
          : ratio < 1.21
            ? 5
            : 6;
}
export const zoneColors = [
  "#a3b6bd",
  "#78c7ec",
  "#9cd66b",
  "#ffcc66",
  "#ff9867",
  "#e97590",
];
export { workouts, workoutStep } from "./workouts";
