import { createServer } from "node:http";
import { readJson, writeJson, mergeRecords, dataDir } from "./store.mjs";
import { validateRide } from "./ride-validation.mjs";
const port = Number(process.env.VELORA_SERVICE_PORT || 18766),
  host = "127.0.0.1";
const origins = new Set(["http://127.0.0.1:5173", "http://localhost:5173"]);
let settings = await readJson("settings.json"),
  jobs = await readJson("rides.json");
let prefs = await readJson("web-upload.json", { autoUpload: true });
for (const job of Object.values(jobs)) {
  if (["queued", "processing"].includes(job.state)) {
    job.state = "local";
    job.message = "API 연동 중단 · 데스크톱 앱의 웹 업로드를 사용하세요.";
  }
  if (job.state === "uploading") {
    job.state = "needs_review";
    job.message =
      "전송 중 중단되었습니다. Strava에서 기존 활동을 확인한 뒤 이어서 진행하세요.";
  }
}
let writes = Promise.resolve();
const persist = () => {
  writes = writes.catch(() => {}).then(() => writeJson("rides.json", jobs));
  return writes;
};
await persist();
const summary = (job) => ({
  id: job.id,
  title: job.title,
  source: job.source,
  duration: job.duration,
  state: job.state,
  message: job.message || "",
  activityId: job.activityId || null,
  createdAt: job.createdAt,
});
async function body(req) {
  if (!req.headers["content-type"]?.startsWith("application/json"))
    throw Error("JSON만 허용됩니다.");
  let text = "";
  for await (const chunk of req) {
    text += chunk;
    if (text.length > 16000000) throw Error("요청이 너무 큽니다.");
  }
  return JSON.parse(text || "{}");
}
const server = createServer(async (req, res) => {
  const send = (code, value) => {
    res.writeHead(code, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(value));
  };
  try {
    if (
      req.headers.host !== `${host}:${port}` ||
      !origins.has(req.headers.origin)
    ) {
      send(403, { error: "VELORA 화면에서 요청하세요." });
      return;
    }
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin);
    res.setHeader("Vary", "Origin");
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      res.end();
      return;
    }
    const url = new URL(req.url, `http://${host}:${port}`);
    if (url.pathname === "/settings") {
      if (req.method === "GET") {
        send(200, settings);
        return;
      }
      if (req.method === "PUT") {
        settings = mergeRecords(settings, await body(req));
        await writeJson("settings.json", settings);
        send(200, { saved: true });
        return;
      }
    }
    if (url.pathname === "/status" && req.method === "GET") {
      send(200, {
        transport: "browser-ui",
        autoUpload: prefs.autoUpload,
        dataDir,
        rides: Object.values(jobs)
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, 30)
          .map(summary),
      });
      return;
    }
    if (url.pathname === "/web/preferences" && req.method === "PUT") {
      const value = await body(req);
      if (typeof value.autoUpload !== "boolean") throw Error("설정 형식 오류");
      prefs.autoUpload = value.autoUpload;
      await writeJson("web-upload.json", prefs);
      send(200, prefs);
      return;
    }
    if (url.pathname.startsWith("/strava/")) {
      send(410, {
        error:
          "API 연동은 제거되었습니다. 데스크톱 앱의 Strava 웹 업로드를 사용하세요.",
      });
      return;
    }
    if (url.pathname === "/rides" && req.method === "POST") {
      const ride = validateRide(await body(req));
      if (!jobs[ride.id]) {
        jobs[ride.id] = {
          ...ride,
          createdAt: Date.now(),
          state: "local",
          message:
            ride.source === "demo"
              ? "데모 기록 · 로컬 저장만"
              : "컴퓨터 저장 완료 · Strava 웹 업로드 가능",
        };
        await persist();
      }
      send(200, { ...summary(jobs[ride.id]), autoUpload: prefs.autoUpload });
      return;
    }
    const match = url.pathname.match(
      /^\/rides\/([-a-z0-9]{10,60})(?:\/(files|state))?$/,
    );
    if (match) {
      const job = jobs[match[1]];
      if (!job) {
        send(404, { error: "기록 없음" });
        return;
      }
      if (req.method === "GET") {
        send(
          200,
          match[2] === "files"
            ? {
                ...summary(job),
                tcx: job.tcx,
                png: job.png,
                description: job.description,
              }
            : summary(job),
        );
        return;
      }
      if (req.method === "PUT" && match[2] === "state") {
        const value = await body(req);
        if (
          ![
            "local",
            "uploading",
            "needs_login",
            "needs_review",
            "complete",
          ].includes(value.state) ||
          typeof value.message !== "string" ||
          value.message.length > 1000
        )
          throw Error("상태 형식 오류");
        job.state = value.state;
        job.message = value.message;
        if (value.activityId) {
          if (!/^\d+$/.test(value.activityId)) throw Error("활동 ID 오류");
          job.activityId = value.activityId;
        }
        await persist();
        send(200, summary(job));
        return;
      }
    }
    send(404, { error: "경로 없음" });
  } catch (e) {
    send(400, { error: e.message });
  }
});
server.listen(port, host, () =>
  console.log(
    `VELORA 저장 서비스 http://${host}:${port} · ${dataDir} · API 없음`,
  ),
);
