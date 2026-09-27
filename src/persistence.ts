export const serviceUrl = "http://127.0.0.1:18766";
const keys = [
  "velora-settings",
  "velora-custom-workouts-v1",
  "velora-preferences",
];
const meta = "velora-storage-times";
let queue = Promise.resolve();
let diskAvailable = false;
export function storageStatus() {
  return diskAvailable
    ? "브라우저 + 컴퓨터 파일에 저장됨"
    : "브라우저에 저장됨 · 컴퓨터 백업 서비스 미연결";
}
export async function service(path: string, init: RequestInit = {}) {
  if (!(window as any).velora && !["127.0.0.1","localhost"].includes(location.hostname)) throw new Error("데스크톱 앱에서 사용할 수 있습니다.");
  const response = await fetch(serviceUrl + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
    signal: AbortSignal.timeout(5000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "로컬 서비스 오류");
  return data;
}
function records() {
  const times = JSON.parse(localStorage.getItem(meta) || "{}");
  const data: Record<string, { value: string; updatedAt: number }> = {};
  for (const key of keys) {
    const value = localStorage.getItem(key);
    if (value !== null) data[key] = { value, updatedAt: times[key] || 1 };
  }
  return data;
}
async function mirror() {
  try {
    await service("/settings", {
      method: "PUT",
      body: JSON.stringify(records()),
    });
    diskAvailable = true;
  } catch {
    diskAvailable = false;
  }
}
export async function bootstrapPersistence() {
  try {
    const disk = await service("/settings");
    const local = records();
    const times = JSON.parse(localStorage.getItem(meta) || "{}");
    for (const key of keys)
      if (
        disk[key] &&
        (!local[key] || disk[key].updatedAt > local[key].updatedAt)
      ) {
        JSON.parse(disk[key].value);
        localStorage.setItem(key, disk[key].value);
        times[key] = disk[key].updatedAt;
      }
    localStorage.setItem(meta, JSON.stringify(times));
    await mirror();
  } catch {
    /* Browser storage remains durable without the companion. */
  }
}
export function saveSetting(key: string, value: string) {
  if (!keys.includes(key)) throw new Error("지원하지 않는 설정");
  localStorage.setItem(key, value);
  const times = JSON.parse(localStorage.getItem(meta) || "{}");
  times[key] = Date.now();
  localStorage.setItem(meta, JSON.stringify(times));
  queue = queue.then(mirror);
}
export function savePreferences(value: Record<string, unknown>) {
  let old = {};
  try {
    old = JSON.parse(localStorage.getItem("velora-preferences") || "{}");
  } catch {}
  try {
    saveSetting("velora-preferences", JSON.stringify({ ...old, ...value }));
  } catch {}
}
export function readPreferences() {
  try {
    const value = JSON.parse(
      localStorage.getItem("velora-preferences") || "{}",
    );
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  } catch {
    return {};
  }
}
