const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld(
  "velora",
  Object.freeze({
    desktop: true,
    openStrava: () => ipcRenderer.invoke("strava:open"),
    uploadRide: (id) => ipcRenderer.invoke("strava:upload", id),
    openDataFolder: () => ipcRenderer.invoke("data:open"),
  }),
);
