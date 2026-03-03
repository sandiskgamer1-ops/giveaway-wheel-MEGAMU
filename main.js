/**
 * main.js — FINAL STABLE BUILD (F12 FIXED PROPERLY)
 */

const {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
} = require("electron");

const path = require("path");
const fs = require("fs");

let mainWindow = null;
let currentStreamMode = null;
let switchingWindow = false;
let cachedParticipants = [];
let liveWebhookSent = false;

/* =====================================================
   USER FILES (BUILD SAFE)
=====================================================*/
function ensureUserFiles(){

  const userData = app.getPath("userData");

  const configPath = path.join(userData,"config.json");
  const historyPath = path.join(userData,"history.json");

  if(!fs.existsSync(configPath)){
    const defaultConfig = {
      oauth:"",
      channel:"",
      command:"!join",
      language:"es",
      streamMode:false,
      debug:false,
      dv:"",
      apiKey:"",
      discordLiveWebhook:"",
      discordPrizeWebhook:""
    };

    fs.writeFileSync(
      configPath,
      JSON.stringify(defaultConfig,null,2)
    );
  }

  if(!fs.existsSync(historyPath)){
    fs.writeFileSync(
      historyPath,
      JSON.stringify([],null,2)
    );
  }
}

/* =====================================================
   ATTACH KEYBOARD SHORTCUTS (WINDOW SAFE)
=====================================================*/
function attachShortcuts(win){

  win.webContents.on("before-input-event", (event, input) => {

    // F12 → Toggle Debug Panel
    if (input.type === "keyDown" && input.key === "F12") {
      event.preventDefault();
      win.webContents.send("toggle-debug-panel");
    }

    // Ctrl + Shift + I → DevTools
    if (
      input.type === "keyDown" &&
      input.control &&
      input.shift &&
      input.key.toLowerCase() === "i"
    ) {
      event.preventDefault();
      win.webContents.toggleDevTools();
    }

  });
}

/* =====================================================
   CREATE WINDOW
=====================================================*/
function createWindow(transparent = false, bounds = null){

  mainWindow = new BrowserWindow({

    width: bounds?.width || 1400,
    height: bounds?.height || 900,
    x: bounds?.x,
    y: bounds?.y,

    frame:false,
    transparent,

    backgroundColor:
      transparent
        ? "#00000000"
        : "#0b0b0b",

    resizable:true,
    movable:true,
    minimizable:true,
    closable:true,

    titleBarStyle:"hidden",

    webPreferences:{
      nodeIntegration:true,
      contextIsolation:false
    }
  });

  Menu.setApplicationMenu(null);
  mainWindow.loadFile("index.html");

  attachShortcuts(mainWindow);
}

/* =====================================================
   APP READY
=====================================================*/
app.whenReady().then(()=>{

  ensureUserFiles();

  const userData = app.getPath("userData");
  const configPath = path.join(userData,"config.json");

  let streamMode = false;

  try{
    const cfg = JSON.parse(
      fs.readFileSync(configPath,"utf-8")
    );
    streamMode = cfg.streamMode || false;
  }catch{}

  currentStreamMode = streamMode;

  createWindow(streamMode);
});

/* =====================================================
   SAFE EXIT
=====================================================*/
app.on("window-all-closed", () => {
  if (switchingWindow) return;
  if (process.platform !== "darwin") app.quit();
});

/* =====================================================
   WINDOW CONTROLS
=====================================================*/
ipcMain.on("window-minimize", ()=>mainWindow?.minimize());

ipcMain.on("window-close", ()=>{
  if(mainWindow && !mainWindow.isDestroyed())
    mainWindow.destroy();
});

/* =====================================================
   STREAM MODE (NO LOOP / NO MULTI WINDOWS)
=====================================================*/
ipcMain.handle("toggle-stream-mode", async (_, enabled) => {

  if (!mainWindow) return;
  if (switchingWindow) return;

  switchingWindow = true;
  currentStreamMode = enabled;

  const bounds = mainWindow.getBounds();
  const oldWindow = mainWindow;

  const newWindow = new BrowserWindow({

    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,

    frame:false,
    transparent: enabled,

    backgroundColor:
      enabled ? "#00000000" : "#0b0b0b",

    resizable:true,
    movable:true,
    minimizable:true,
    closable:true,

    titleBarStyle:"hidden",

    webPreferences:{
      nodeIntegration:true,
      contextIsolation:false
    }
  });

  Menu.setApplicationMenu(null);
  await newWindow.loadFile("index.html");

  attachShortcuts(newWindow);

  mainWindow = newWindow;

  mainWindow.setAlwaysOnTop(
    enabled,
    "screen-saver"
  );

  if (oldWindow && !oldWindow.isDestroyed())
    oldWindow.destroy();

  switchingWindow = false;
});

/* =====================================================
   USER DATA PATH
=====================================================*/
ipcMain.handle("get-user-path", ()=>app.getPath("userData"));

/* =====================================================
   PARTICIPANTS CACHE
=====================================================*/
ipcMain.on("save-participants", (_, data) => {
  cachedParticipants = data || [];
});

ipcMain.handle("get-participants", () => {
  return cachedParticipants;
});

/* =====================================================
   API MU - GET AWARDS
=====================================================*/
ipcMain.handle("get-awards", async (_, config) => {

  try {

    if (!config.dv || !config.apiKey) {
      return [];
    }

    const url =
      `https://www.megamu.net/dvapi.php?dv=${config.dv}&key=${config.apiKey}&action=getawards`;

    const response = await fetch(url);
    const text = await response.text();

    const data = JSON.parse(text);

    if (data.result === -101) throw new Error("AUTH_ERROR");
    if (data.result === -100) throw new Error("BAD_PARAMS");
    if (data.result === 0) throw new Error("INVALID_ACTION");

    return Array.isArray(data.awards)
      ? data.awards
      : [];

  } catch (err) {

    console.error("API MU error:", err);

    return {
      error: true,
      message: err.message
    };
  }
});

/* =====================================================
   DISCORD WEBHOOK RESET (DEBUG)
=====================================================*/
ipcMain.on("reset-discord-cooldowns", () => {

  lastLiveWebhook = 0;
  lastPrizeWebhook = 0;
  liveWebhookSent = false;

  console.log("Discord cooldowns reset (DEBUG)");

});

/* =====================================================
   DISCORD WEBHOOK
=====================================================*/
let lastLiveWebhook = 0;
let lastPrizeWebhook = 0;
const DISCORD_COOLDOWN_MS = 60000;

ipcMain.handle("send-discord", async (_, payload) => {

  if (!payload || !payload.webhook) {
    return { error: true, message: "No webhook configured" };
  }

  const now = Date.now();

  if (payload.type === "live" &&
      now - lastLiveWebhook < DISCORD_COOLDOWN_MS) {
    return { error: true, message: "Live cooldown active" };
  }

  if (payload.type === "prize" &&
      now - lastPrizeWebhook < DISCORD_COOLDOWN_MS) {
    return { error: true, message: "Prize cooldown active" };
  }

  try {

    if (payload.type === "live" && liveWebhookSent) {
      return { skipped: true };
    }

    await fetch(payload.webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: payload.type === "live"
          ? "EN VIVO BOT"
          : "BOT DE PREMIOS",
        embeds: [{
          title: payload.embed?.title || "",
          description: payload.embed?.description || "",
          color: payload.embed?.color || 5814783,
          fields: payload.embed?.fields || [],
          footer: { text: "Megamu Sorteos" },
          timestamp: new Date().toISOString()
        }]
      })
    });

    if (payload.type === "live") {
      liveWebhookSent = true;
      lastLiveWebhook = now;
    }

    if (payload.type === "prize") {
      lastPrizeWebhook = now;
    }

    return { success: true };

  } catch (err) {
    return { error: true, message: err.message };
  }
});