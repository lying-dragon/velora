export type ActivitySample = {
  seconds: number;
  watts: number;
  cadence: number | null;
  heartRate: number | null;
  distance: number;
  speed: number;
  recordedAt?: number;
};
export type Activity = {
  id: string;
  startedAt: number;
  duration: number;
  distance: number;
  energy: number;
  ascent: number;
  ftp: number;
  source: string;
  workout: string;
  route: string;
  samples: ActivitySample[];
};
const xml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
export function activityText(a: Activity) {
  const average = a.duration ? Math.round((a.energy * 1000) / a.duration) : 0;
  return {
    title: `${a.source === "demo" ? "[DEMO] " : ""}VELORA · ${a.workout}`.slice(
      0,
      160,
    ),
    description: [
      `${a.workout} — ${a.route}`,
      `${Math.floor(a.duration / 60)}분 ${Math.round(a.duration % 60)}초 · ${(a.distance / 1000).toFixed(2)} km · 평균 ${average} W · ${Math.round(a.energy)} kJ`,
      `설정 FTP ${a.ftp} W · ${a.source === "demo" ? "데모 데이터" : "센서 실측 파워"}`,
      "실내 가상 라이딩. 거리·속도·상승고도는 VELORA 물리 시뮬레이션 값이며 실제 GPS 경로가 아닙니다.",
      "오늘의 페달링을 차곡차곡, VELORA.",
    ].join("\n"),
  };
}
export function activityTcx(a: Activity) {
  const start = new Date(a.startedAt).toISOString();
  const points = a.samples
    .map(
      (s) =>
        `<Trackpoint><Time>${new Date(s.recordedAt ?? a.startedAt + s.seconds * 1000).toISOString()}</Time><DistanceMeters>${s.distance.toFixed(2)}</DistanceMeters>${s.heartRate === null ? "" : `<HeartRateBpm><Value>${Math.round(s.heartRate)}</Value></HeartRateBpm>`}${s.cadence === null ? "" : `<Cadence>${Math.max(0, Math.min(254, Math.round(s.cadence)))}</Cadence>`}<Extensions><ae:TPX><ae:Speed>${(s.speed / 3.6).toFixed(3)}</ae:Speed><ae:Watts>${Math.round(s.watts)}</ae:Watts></ae:TPX></Extensions></Trackpoint>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" xmlns:ae="http://www.garmin.com/xmlschemas/ActivityExtension/v2"><Activities><Activity Sport="Biking"><Id>${start}</Id><Lap StartTime="${start}"><TotalTimeSeconds>${a.duration.toFixed(2)}</TotalTimeSeconds><DistanceMeters>${a.distance.toFixed(2)}</DistanceMeters><Calories>0</Calories><Intensity>Active</Intensity><TriggerMethod>Manual</TriggerMethod><Track>${points}</Track></Lap><Notes>${xml(activityText(a).description)}</Notes></Activity></Activities></TrainingCenterDatabase>`;
}
export function activityImage(a: Activity) {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 800;
  const c = canvas.getContext("2d")!;
  const background = c.createLinearGradient(0, 0, 1200, 800);
  background.addColorStop(0, "#143c36");
  background.addColorStop(1, "#102420");
  c.fillStyle = background;
  c.fillRect(0, 0, 1200, 800);
  c.fillStyle = "#28483e";
  c.beginPath();
  c.moveTo(550, 320);
  c.lineTo(820, 65);
  c.lineTo(980, 260);
  c.lineTo(1100, 125);
  c.lineTo(1200, 300);
  c.lineTo(1200, 450);
  c.closePath();
  c.fill();
  c.fillStyle = "#ff9969";
  c.font = "bold 48px sans-serif";
  c.fillText("velora", 64, 90);
  c.font = "18px sans-serif";
  c.fillText(a.source === "demo" ? "DEMO RIDE" : "INDOOR CYCLING", 64, 128);
  c.fillStyle = "#f5f0d9";
  c.font = "bold 42px sans-serif";
  c.fillText(a.workout.slice(0, 32), 64, 210, 1060);
  c.font = "22px sans-serif";
  c.fillStyle = "#b8cbbb";
  c.fillText(
    `${a.route} · ${new Date(a.startedAt).toLocaleDateString("ko-KR")}`,
    64,
    255,
  );
  const stats = [
    [(a.distance / 1000).toFixed(2), "km · 가상 거리"],
    [String(Math.round(a.duration / 60)), "분 · 페달링"],
    [
      String(a.duration ? Math.round((a.energy * 1000) / a.duration) : 0),
      "W · 평균 파워",
    ],
    [String(Math.round(a.energy)), "kJ · 수행 에너지"],
  ];
  stats.forEach(([value, label], i) => {
    const x = 64 + i * 280;
    c.fillStyle = "#fff1d3";
    c.font = "bold 64px sans-serif";
    c.fillText(value, x, 380);
    c.fillStyle = "#a9c3b1";
    c.font = "20px sans-serif";
    c.fillText(label, x, 420);
  });
  c.strokeStyle = "#708f79";
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(64, 650);
  c.lineTo(1136, 650);
  c.stroke();
  const max = a.samples.reduce((max, s) => Math.max(max, s.watts), 100);
  c.fillStyle = "#ff9969";
  for (let i = 0; i < 220; i++) {
    const from = Math.floor((i * a.samples.length) / 220),
      to = Math.max(from + 1, Math.floor(((i + 1) * a.samples.length) / 220));
    const chunk = a.samples.slice(from, to);
    const value = chunk.reduce((n, s) => n + s.watts, 0) / (chunk.length || 1);
    c.fillRect(
      64 + i * 4.87,
      650 - (value / max) * 160,
      3.7,
      (value / max) * 160,
    );
  }
  c.fillStyle = "#b5cabb";
  c.font = "18px sans-serif";
  c.fillText("POWER TIMELINE", 64, 695);
  c.fillText(`FTP ${a.ftp} W · 오늘의 페달링을 차곡차곡.`, 64, 749);
  return canvas.toDataURL("image/png");
}
export function downloadFile(content: string, name: string, mime: string) {
  const link = document.createElement("a");
  link.href = content.startsWith("data:image/")
    ? content
    : URL.createObjectURL(new Blob([content], { type: mime }));
  link.download = name;
  link.click();
  if (link.href.startsWith("blob:"))
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
