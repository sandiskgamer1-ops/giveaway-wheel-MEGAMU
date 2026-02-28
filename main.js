/**
 * main.js — FINAL STABLE BUILD VERSION
 */

const {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  globalShortcut
} = require("electron");

const path = require("path");
const fs = require("fs");

let mainWindow = null;
let currentStreamMode = null;
let switchingWindow = false;
let cachedParticipants = [];

/* =====================================================
   USER FILES (BUILD SAFE)
=====================================================*/
function ensureUserFiles(){

  const userData = app.getPath("userData");

  const configPath =
    path.join(userData,"config.json");

  const historyPath =
    path.join(userData,"history.json");

  // CONFIG
  if(!fs.existsSync(configPath)){

    const defaultConfig = {
      oauth:"",
      channel:"",
      command:"!join",
      language:"es",
      streamMode:false,
      debug:false,
      dv:"",
      apiKey:""
    };

    fs.writeFileSync(
      configPath,
      JSON.stringify(defaultConfig,null,2)
    );
  }

  // HISTORY
  if(!fs.existsSync(historyPath)){
    fs.writeFileSync(
      historyPath,
      JSON.stringify([],null,2)
    );
  }
}


/* =====================================================
   CREATE WINDOW
=====================================================*/
function createWindow(
  transparent = false,
  bounds = null
){

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

  // DEVTOOLS SHORTCUT
  globalShortcut.unregisterAll();

  globalShortcut.register(
    "CommandOrControl+Shift+I",
    ()=>{
      mainWindow?.webContents.toggleDevTools();
    }
  );
});


/* =====================================================
   SAFE EXIT
=====================================================*/
app.on("window-all-closed", () => {

  // ✅ NO cerrar mientras cambiamos modo
  if (switchingWindow) return;

  if (process.platform !== "darwin")
    app.quit();
});

app.on("will-quit",()=>{
  globalShortcut.unregisterAll();
});


/* =====================================================
   WINDOW CONTROLS
=====================================================*/
ipcMain.on(
  "window-minimize",
  ()=>mainWindow?.minimize()
);

ipcMain.on(
  "window-close",
  ()=>{
    if(mainWindow &&
       !mainWindow.isDestroyed())
      mainWindow.destroy();
  }
);


/* =====================================================
   STREAM MODE (NO LOOP / NO MULTI WINDOWS)
=====================================================*/
ipcMain.handle(
  "toggle-stream-mode",
  async (_, enabled) => {

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

    mainWindow = newWindow;

    mainWindow.setAlwaysOnTop(
      enabled,
      "screen-saver"
    );

    // ✅ destruir después
    if (oldWindow && !oldWindow.isDestroyed())
      oldWindow.destroy();

    switchingWindow = false;
  }
);

/* =====================================================
   USER DATA PATH
=====================================================*/
ipcMain.handle(
  "get-user-path",
  ()=>app.getPath("userData")
);
ipcMain.on("overlay-update", (_, data) => {
  overlayState = data;
});

/* =====================================================
   PARTICIPANTS CACHE (STREAM SAFE)
=====================================================*/

// guardar participantes antes de recrear ventana
ipcMain.on("save-participants", (_, data) => {
  cachedParticipants = data || [];
});

// devolver participantes al nuevo renderer
ipcMain.handle("get-participants", () => {
  return cachedParticipants;
});

/* =====================================================
   API MU
=====================================================*/
ipcMain.handle(
  "get-awards",
  async (_, config) => {

    try {

      const url =
        `https://www.megamu.net/dvapi.php?dv=${config.dv}&key=${config.apiKey}&action=getawards`;

      const response = await fetch(url);
      const text = await response.text();

      const data = JSON.parse(text);

      // ===============================
      // VALIDACIÓN API MU
      // ===============================

      if (data.result === -101)
        throw new Error("AUTH_ERROR");

      if (data.result === -100)
        throw new Error("BAD_PARAMS");

      if (data.result === 0)
        throw new Error("INVALID_ACTION");

      // ✅ éxito aunque no haya premios
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

ipcMain.on("overlay-update", (_, data) => {
  overlayState = data;
});