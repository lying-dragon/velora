import { spawn } from "node:child_process";
const children = [];
try {
  const response = await fetch("http://127.0.0.1:18766/status", {
    headers: { Origin: "http://127.0.0.1:5173" },
    signal: AbortSignal.timeout(500),
  });
  if (!response.ok) throw Error();
} catch {
  children.push(
    spawn(process.execPath, ["services/server.mjs"], { stdio: "inherit" }),
  );
}
const vite = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "--host",
    "127.0.0.1",
    "--port",
    "5173",
    "--strictPort",
  ],
  { stdio: "inherit" },
);
children.push(vite);
const stop = () => children.forEach((child) => child.kill("SIGTERM"));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
vite.on("exit", (code) => {
  stop();
  process.exitCode = code || 0;
});
