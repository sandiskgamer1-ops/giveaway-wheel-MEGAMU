
/**
 * applyTheme()
 * Applies theme values to CSS variables so the UI updates instantly.
 */
function applyTheme(theme){

  if(!theme) return;

  const root = document.documentElement;

  root.style.setProperty("--accent-color", theme.accent || "#9146ff");
  root.style.setProperty("--accent-glow", theme.accent || "#9146ff");

  root.style.setProperty("--bg-primary", theme.background || "#0f0f0f");
  root.style.setProperty("--panel-bg", theme.panel || "#141414");

  root.style.setProperty("--text-primary", theme.text || "#ffffff");

  root.style.setProperty("--accent-highlight", theme.highlight || theme.accent);

  root.style.setProperty("--roulette-glow",(theme.accent || "#9146ff")+"66");
}

function applyPresetTheme(name){

  const presets = {

    cyberpunk:{
      accent:"#ff2fd1",
      background:"#0a0a0f",
      panel:"#11111a",
      text:"#ffffff",
      highlight:"#00eaff"
    },

    gold:{
      accent:"#d4af37",
      background:"#0f0f0f",
      panel:"#141414",
      text:"#ffffff",
      highlight:"#ffd700"
    },

    emerald:{
      accent:"#2ecc71",
      background:"#0f1110",
      panel:"#141a14",
      text:"#ffffff",
      highlight:"#2ecc71"
    },

    ruby:{
      accent:"#e63946",
      background:"#0f0a0a",
      panel:"#1a1111",
      text:"#ffffff",
      highlight:"#ff4d5a"
    },

    ocean:{
      accent:"#00b4d8",
      background:"#0a0f14",
      panel:"#101820",
      text:"#ffffff",
      highlight:"#48cae4"
    },

    neon:{
      accent:"#39ff14",
      background:"#050505",
      panel:"#0c0c0c",
      text:"#ffffff",
      highlight:"#39ff14"
    },

    solar:{
      accent:"#ff9f1c",
      background:"#0f0c08",
      panel:"#19130d",
      text:"#ffffff",
      highlight:"#ffd166"
    },

    matrix:{
      accent:"#00ff41",
      background:"#020402",
      panel:"#051105",
      text:"#d4ffd4",
      highlight:"#00ff41"
    },

    sunset:{
      accent:"#ff6b6b",
      background:"#140a0a",
      panel:"#1c1111",
      text:"#ffffff",
      highlight:"#ffa07a"
    },

    midnight:{
      accent:"#6c63ff",
      background:"#0a0a12",
      panel:"#12121c",
      text:"#ffffff",
      highlight:"#8f8aff"
    },

    sakura:{
      accent:"#ff77aa",
      background:"#140b10",
      panel:"#1c1116",
      text:"#ffffff",
      highlight:"#ffb7d5"
    },

    ice:{
      accent:"#7dd3fc",
      background:"#0a0f14",
      panel:"#101820",
      text:"#ffffff",
      highlight:"#bfe9ff"
    }

  };

  const preset = presets[name];
  if(!preset) return;

  config.theme = preset;

  applyTheme(preset);
}


function initThemeEditor(){

  const accent = document.getElementById("themeAccent");
  const bg = document.getElementById("themeBackground");
  const panel = document.getElementById("themePanel");
  const text = document.getElementById("themeText");
  const highlight = document.getElementById("themeHighlight");

  if(!accent) return;

  function update(){

    config.theme = {
      accent: accent.value,
      background: bg.value,
      panel: panel.value,
      text: text.value,
      highlight: highlight.value
    };

    applyTheme(config.theme);
    saveTheme();
  }

  accent.addEventListener("input",update);
  bg.addEventListener("input",update);
  panel.addEventListener("input",update);
  text.addEventListener("input",update);
  highlight.addEventListener("input",update);
}


function toggleThemeEditor(){

  const el =
    document.getElementById("themeEditorContent");

  if(!el) return;

  if(el.style.display === "none" || el.style.display === ""){
    el.style.display = "block";
  }else{
    el.style.display = "none";
  }

}

/**
 * saveTheme()
 * Persists theme settings to config.json
 */
function saveTheme(){

  const fs = require("fs");
  const path = require("path");

  try{
    fs.writeFileSync(
      path.join(userPath,"config.json"),
      JSON.stringify(config,null,2)
    );
  }catch(err){
    console.error("Theme save error:",err);
  }
}


/**
 * renderer.js (PRO STREAM SAFE)
 * Fixes applied:
 * - Single opacity controller bound correctly after DOM load.
 * - Prevents undefined variables (glass/value errors).
 * - OBS transparency preserved (CSS-only opacity).
 * - No logic removed, only stabilized and ordered.
 */

const { ipcRenderer } = require("electron");

/* =====================================================
   "+(translations.get("debug_panel","Debug Panel"))+" CONTROL (IPC FROM MAIN)
=====================================================*/

let DEBUG_PANEL_ACTIVE = false;
let DEBUG_MODE = false;
ipcRenderer.on("toggle-debug-panel", () => {

  DEBUG_PANEL_ACTIVE = !DEBUG_PANEL_ACTIVE;

  // 🔥 Activar DEBUG_MODE automáticamente
  DEBUG_MODE = DEBUG_PANEL_ACTIVE;

  const panel = document.getElementById("debugPanel");
  const indicator = document.getElementById("debugIndicator");

  if(panel){
    panel.classList.toggle("hidden", !DEBUG_PANEL_ACTIVE);
  }

  if(indicator){
    indicator.classList.toggle("hidden", !DEBUG_PANEL_ACTIVE);
  }

  console.log("DEBUG MODE:", DEBUG_MODE);

});

let config = {};
let userPath = "";
const fs = require("fs");
const path = require("path");
let participants = [];
let awards = [];
let awardsRefreshInterval = null;
let translations = {};
let currentLanguage = config.language || "es";
let currentWinner = null;
let winnerGameName = null;
let countdownInterval = null;
let timeLeft = 0;
let waitingForGameName = false;
let twitchSocket = null;
window.addEventListener("beforeunload", () => {

  try {
    twitchSocket?.close();
  } catch {}

  if (awardsRefreshInterval)
    clearInterval(awardsRefreshInterval);

});

let prizeConfirmed = false;
let drawState = "idle";
// idle | spinningUser | waitingName | spinningPrize | finished
let winners = [];

// history se cargará después de loadConfig()


let forcedWinner = null;
let forcedPrize = null;
let simulateApiError = false;

// ===============================
// ASSETS RESOLVER (DEV + BUILD)
// ===============================

function getAsset(file) {

  const isPackaged =
    __dirname.includes("app.asar");

  const basePath = isPackaged
    ? path.join(process.resourcesPath, "assets")
    : path.join(__dirname, "assets");

  return path.join(basePath, file);
}

// cache icono twitch (NO recalcular cada render)
const twitchIconPath =
  "file://" +
  getAsset("Twitch.png").replace(/\\/g, "/");
async function loadConfig() {

  userPath =
    await ipcRenderer.invoke("get-user-path");

  const configPath =
    path.join(userPath, "config.json");

  config = JSON.parse(
    fs.readFileSync(configPath, "utf-8")
  );
  
  // 🔒 Garantizar propiedades Discord siempre definidas
config.discordLiveWebhook = config.discordLiveWebhook || "";
config.discordPrizeWebhook = config.discordPrizeWebhook || "";
}

function getBasePath() {

  try {

    // app empaquetada
    if (process.resourcesPath &&
        __dirname.includes("app.asar")) {

      return process.resourcesPath;
    }

  } catch (e) {}

  // desarrollo
  return __dirname;
}

function getResourcePath(folder, file) {

  const base = getBasePath();

  if (!folder) {
    return path.join(base, file);
  }

  return path.join(base, folder, file);
}

// ===============================
// Cargar premios desde API MU
// ===============================

// ===============================
// RENDER PREMIOS
// ===============================

function renderAwards() {

  const container =
    document.getElementById("awards");

  if (!container) return;

  container.innerHTML = "";

  awards.forEach(a => {

    const div =
      document.createElement("div");

    div.textContent = a.name;

    container.appendChild(div);
  });
}


// ===============================
// CARGAR PREMIOS
// ===============================

async function loadAwards() {

  try {

    const response =
      await ipcRenderer.invoke(
        "get-awards",
        config
      );

    if (response?.error) {
      console.error(response.message);
      return;
    }

    awards = response;

    renderAwards();

  } catch (err) {
    console.error(
(translations["awards_load_error"] || "Error loading prizes") + ":",err);
  }
}

// ===============================
// AUTO REFRESH PREMIOS
// ===============================

function startAwardsAutoRefresh() {

  if (awardsRefreshInterval) {
    clearInterval(awardsRefreshInterval);
  }

  // ✅ CARGA INSTANTÁNEA AL ABRIR APP
  loadAwards();

  awardsRefreshInterval = setInterval(() => {

    // no actualizar durante sorteo
    if (drawState !== "idle") return;

    loadAwards();

  }, 5000);
}

// ===============================
// LIVE STATUS
// ===============================

function setLiveStatus(isConnected){

  const liveBtn = document.getElementById("liveBtn");
  if(!liveBtn) return;

  if(isConnected){

    liveBtn.classList.remove("live-idle");
    liveBtn.classList.add("live-active");

    liveBtn.innerHTML =
      '<span class="live-dot"></span> ' +
      (translations["live"] || "Live");

  }else{

    liveBtn.classList.remove("live-active");
    liveBtn.classList.add("live-idle");

    liveBtn.innerHTML =
      '<span class="live-dot"></span> ' +
      (translations["offline"] || "Offline");
  }
}

// ===============================
// Twitch IRC
// ===============================

function connectTwitch() {

  console.log("COMMAND CONFIG:", config.command);

  twitchSocket =
    new WebSocket("wss://irc-ws.chat.twitch.tv:443");

  const socket = twitchSocket;

  socket.onopen = () => {

    socket.send(
      "CAP REQ :twitch.tv/tags twitch.tv/commands twitch.tv/membership"
    );

    socket.send(`PASS oauth:${config.oauth}`);
    socket.send(`NICK ${config.channel}`);
    socket.send(`JOIN #${config.channel}`);

    console.log("✅ Conectado a Twitch IRC");

    // 🔥 Indicador visual
    setLiveStatus(true);

    // 🔥 AUTO LIVE WEBHOOK (OPCIÓN B - SIN AWAIT)
    if (config.discordLiveWebhook && config.discordLiveWebhook.length > 10) {
      sendDiscord("live").catch(err => {
        console.error("Live webhook error:", err);
      });
    }
  };

  socket.onmessage = (event) => {

    const lines = event.data.split("\r\n");

    lines.forEach(line => {

      // KEEP ALIVE
      if (line.startsWith("PING")) {
        socket.send("PONG :tmi.twitch.tv");
        return;
      }

      if (!line.includes("PRIVMSG")) return;

      const parsed = parseIRC(line);
      if (!parsed) return;

      const { user, message, badges } = parsed;

      console.log("CHAT:", user, "→", message);

      const cleanMessage =
        (message || "")
          .trim()
          .toLowerCase();

      const joinCommand =
        (config.command || "")
          .trim()
          .toLowerCase();

      if (cleanMessage === joinCommand) {
        addParticipant(user, badges);
      }

      if (
        waitingForGameName &&
        user === currentWinner &&
        message.startsWith("!")
      ) {

        const name =
          message.substring(1).trim();

        if (name.length > 0) {
          winnerGameName = name;
          stopCountdown();
          showGameName(name);
        }
      }

    });
  };

  socket.onerror = err => {
    console.error("❌ Twitch socket error:", err);
    setLiveStatus(false);
  };

  socket.onclose = () => {
    console.log("⚠ " + (translations["twitch_disconnected"] || "Twitch disconnected"));
    setLiveStatus(false);
  };
}




// ===============================
// Parser IRC
// ===============================

function parseIRC(line) {
  try {
    let tags = {};
    if (line.startsWith("@")) {
      const rawTags = line.slice(1, line.indexOf(" "));
      rawTags.split(";").forEach(tag => {
        const [key, value] = tag.split("=");
        tags[key] = value;
      });
    }

    const userMatch = line.match(/:(\w+)!/);
    const user = userMatch ? userMatch[1] : null;

    const messageMatch = line.match(/PRIVMSG #[^ ]+ :(.*)/);
    const message = messageMatch ? messageMatch[1] : null;

    if (!user || !message) return null;

    return {
      user,
      message: message.trim(),
      badges: tags.badges || ""
    };

  } catch {
    return null;
  }
}


// ===============================
// Participantes
// ===============================

function addParticipant(username, role) {

  const uname = username.toLowerCase();

  let weight = 1;
  let badgesArray = [];

  if (role) {

    const badges = role.toLowerCase();

    if (badges.includes("vip")) {
      weight = 2;
      badgesArray.push("vip");
    }

    if (badges.includes("subscriber")) {
      weight = 2;
      badgesArray.push("subscriber");
    }
  }

  const existing =
    participants.find(
      p => p.user.toLowerCase() === uname
    );

  if (existing) {
    existing.weight = weight;
    existing.userBadges = badgesArray;
  } else {
    participants.push({
      user: username,
      weight,
      eliminated: false,
      userBadges: badgesArray
    });
  }

  renderParticipants();
}


function renderParticipants() {

  console.log("RENDER:", participants.length);
  console.log("ICON:", twitchIconPath);

  const container =
    document.getElementById("participants");

  if (!container) return;

  container.innerHTML = "";

  // ===============================
  // Normalizar participantes
  // ===============================

  const normalized = participants.map(p => {

    if (typeof p === "string") {
      return {
        user: p,
        weight: 1,
        eliminated: false,
        userBadges: []
      };
    }

    return {
      user: p.user || "Unknown",
      weight: p.weight || 1,
      eliminated: p.eliminated || false,
      userBadges: p.userBadges || []
    };
  });

  const activeParticipants =
    normalized.filter(p => !p.eliminated);

  const totalWeight =
    activeParticipants.reduce(
      (sum, p) => sum + p.weight,
      0
    );

  const sortedParticipants =
    [...normalized].sort(
      (a, b) => a.eliminated - b.eliminated
    );

  // ===============================
  // Render
  // ===============================

  sortedParticipants.forEach(p => {

    const div =
      document.createElement("div");

    div.className =
      "participant" +
      (p.eliminated ? " eliminated" : "");

    // ===== LEFT =====
    const left =
      document.createElement("div");
    left.classList.add("participant-left");

    const img =
      document.createElement("img");

    img.classList.add("platform-icon");
    img.src = twitchIconPath;

    // fallback debug si no carga
    img.onerror = () => {
      console.error(
        "No se pudo cargar Twitch.png"
      );
    };

    const name =
      document.createElement("span");

    name.classList.add(
      "participant-name"
    );

    name.textContent = p.user;

    left.appendChild(img);
    left.appendChild(name);

    // ===== RIGHT =====
    const right =
      document.createElement("div");

    right.classList.add(
      "participant-right"
    );

    if (p.weight === 2) {

      const badge =
        document.createElement("span");

      if (
        p.userBadges.includes("vip")
      ) {
        badge.textContent = "VIP";
        badge.classList.add(
          "badge",
          "vip"
        );
      } else {
        badge.textContent = "SUB";
        badge.classList.add(
          "badge",
          "sub"
        );
      }

      right.appendChild(badge);
    }

    const prob =
      document.createElement("span");

    prob.classList.add(
      "participant-prob"
    );

    const probability =
      (!p.eliminated &&
        totalWeight > 0)
        ? (
            (p.weight /
              totalWeight) *
            100
          ).toFixed(2)
        : "0.00";

    prob.textContent =
      probability + "%";

    right.appendChild(prob);

    div.appendChild(left);
    div.appendChild(right);

    container.appendChild(div);
  });

  const countEl =
    document.getElementById("count");

  if (countEl) {
    countEl.textContent =
      activeParticipants.length;
  }
}

// ===============================
// Sorteo participante
// ===============================

const drawBtn =
  document.getElementById("drawBtn");

drawBtn?.addEventListener("click", () => {
  if (participants.length === 0) return;
  startRoulette();
});

const resetBtn = document.getElementById("resetDrawBtn");

if (resetBtn) {
  resetBtn.addEventListener("click", () => {

    // Vaciar participantes
    participants = [];

    // Resetear estado
    drawState = "idle";
    currentWinner = null;

    // Limpiar ruleta visual
    const track = document.getElementById("rouletteTrack");
    if (track) {
      track.innerHTML = "";
      track.style.transform = "translateX(0)";
    }

    // Renderizar lista vacÃÂ¨ÃÂªa
    renderParticipants();
  });
}

function startRoulette() {

  if (drawState !== "idle") return;
  if (participants.length === 0) return;

  drawState = "spinningUser";

  // ?? 1. Elegir ganador UNA sola vez
let winner = null;

if (DEBUG_MODE && forcedWinner) {

  const debugPick =
    participants.find(
      p => p.user === forcedWinner
    );

  if (debugPick) {
    winner = debugPick;
  }
}

// fallback SIEMPRE
if (!winner) {
  winner = weightedRandom(participants);
}
  if (!winner) {
    drawState = "idle";
    return;
  }

if (!winner) {
  console.warn("Winner inválido");
  drawState = "idle";
  return;
}

  const track = document.getElementById("rouletteTrack");
  const container = document.querySelector(".roulette-container");

  if (!track || !container) {
    drawState = "idle";
    return;
  }

  track.style.transition = "none";
  track.style.transform = "translateX(0)";
  track.innerHTML = "";

  const visualList = [];

  const activeParticipants = participants.filter(p => !p.eliminated);

  // ?? Construir lista visual independiente
  for (let i = 0; i < 120; i++) {
    const randomUser =
      activeParticipants[Math.floor(Math.random() * activeParticipants.length)];
    visualList.push(randomUser);
  }

  const winnerIndex = visualList.length;
  visualList.push(winner);

  for (let i = 0; i < 120; i++) {
    const randomUser =
      activeParticipants[Math.floor(Math.random() * activeParticipants.length)];
    visualList.push(randomUser);
  }

  visualList.forEach(p => {
  const div = document.createElement("div");
  div.classList.add("roulette-item");
  div.textContent = p.user;

  // Destacar segun rol
  if (p.userBadges) {
    if (p.userBadges.includes("vip")) {
      div.classList.add("roulette-vip");
    } else if (p.userBadges.includes("subscriber")) {
      div.classList.add("roulette-sub");
    }
  }

  track.appendChild(div);
});

  const firstItem = track.querySelector(".roulette-item");
  if (!firstItem) {
    drawState = "idle";
    return;
  }

  const style = window.getComputedStyle(firstItem);
  const marginLeft = parseFloat(style.marginLeft);
  const marginRight = parseFloat(style.marginRight);
  const itemWidth = firstItem.offsetWidth + marginLeft + marginRight;

  const containerWidth = container.offsetWidth;
  const centerOffset = containerWidth / 2 - (itemWidth / 2);
  const finalPosition = (winnerIndex * itemWidth) - centerOffset;

  track.offsetHeight;

  track.style.transition = "transform 5s cubic-bezier(0.1, 0.7, 0.1, 1)";
  track.style.transform = `translateX(-${finalPosition}px)`;

  setTimeout(() => {

  if (DEBUG_MODE) {

  currentWinner = winner.user;
  winnerGameName = winner.user + "_Debug";
  drawState = "waitingName";

  const screen = document.getElementById("winnerScreen");
  if (screen) screen.classList.remove("hidden");

  showGameName(winnerGameName);

} else {
  showWinner(winner.user);
}

}, 5200);
}

function startPrizeRoulette() {

  if (!awards || awards.length === 0) {
    drawState = "waitingName";
    return;
  }

  // ===============================
  // ✅ SOLO 1 PREMIO → SIN RULETA
  // ===============================
  if (awards.length === 1) {

    drawState = "spinningPrize";

    const prize = awards[0];

    console.log(
  (translations["single_prize"] || "Only one prize left") +
  " → skip animación"
);

    const container =
      document.getElementById("winnerName");

    // pequeño feedback visual (opcional pero limpio)
    if (container) {
      setHTML(container, `
        <div class="winner-box">
          <div class="winner-title">
            ${translations["last_prize"] || "Last prize available"}
          </div>
          <div class="winner-prize">
            ${prize.name}
          </div>
        </div>
      `);
    }

    setTimeout(() => {
      finishDraw(prize);
    }, 500);

    return;
  }

  // ===============================
  // FLOW NORMAL
  // ===============================

  drawState = "spinningPrize";

  let prize;

  if (DEBUG_MODE && forcedPrize) {
    prize = awards.find(a => a.name === forcedPrize);
  } else {
    prize = awards[Math.floor(Math.random() * awards.length)];
  }

  if (!prize) {
    drawState = "waitingName";
    return;
  }

  const track =
    document.getElementById("overlayRouletteTrack");

  const container =
    document.querySelector(".overlay-roulette-container");

  if (!track || !container) {
    drawState = "waitingName";
    return;
  }

  track.style.transition = "none";
  track.style.transform = "translateX(0)";
  track.innerHTML = "";

  const visualList = [];

  // Items antes
  for (let i = 0; i < 120; i++) {
    visualList.push(
      awards[Math.floor(Math.random() * awards.length)]
    );
  }

  const winnerIndex = visualList.length;
  visualList.push(prize);

  // Items después
  for (let i = 0; i < 120; i++) {
    visualList.push(
      awards[Math.floor(Math.random() * awards.length)]
    );
  }

  visualList.forEach(a => {
    const div = document.createElement("div");
    div.classList.add("roulette-item");
    div.textContent = a.name;
    track.appendChild(div);
  });

  requestAnimationFrame(() => {

    const items =
      track.querySelectorAll(".roulette-item");

    const winnerElement =
      items[winnerIndex];

    if (!winnerElement) {
      drawState = "waitingName";
      return;
    }

    const containerWidth =
      container.offsetWidth;

    const winnerWidth =
      winnerElement.offsetWidth;

    const winnerOffset =
      winnerElement.offsetLeft;

    const finalPosition =
      winnerOffset -
      (containerWidth / 2) +
      (winnerWidth / 2);

    track.style.transition =
      "transform 5s cubic-bezier(0.1, 0.7, 0.1, 1)";

    track.style.transform =
      `translateX(-${finalPosition}px)`;

    setTimeout(() => {
      finishDraw(prize);
    }, 5200);

  });
}


// ===============================
// GANADOR + 30 SEGUNDOS
// ===============================

function showWinner(user) {
	
  drawState = "waitingName";
  currentWinner = user;
  waitingForGameName = true;
  timeLeft = 30;

  const screen = document.getElementById("winnerScreen");
  const name = document.getElementById("winnerName");

  setHTML(name, `
  <div class="winner-box countdown-mode">
    <div class="winner-title" data-i18n="winner"></div>
    <div class="winner-name big">${user}</div>

    <div class="countdown-circle">
      <svg class="progress-ring" width="140" height="140">
        <circle
          class="progress-ring-bg"
          cx="70"
          cy="70"
          r="60"
        />
        <circle
          class="progress-ring-progress"
          cx="70"
          cy="70"
          r="60"
          stroke-dasharray="377"
          stroke-dashoffset="0"
        />
      </svg>
      <span id="countdownNumber">${timeLeft}</span>
    </div>

    <div class="winner-subtext" data-i18n="write_ingame"></div>
  </div>
`);

  screen.classList.remove("hidden");

  sendChatMessage(`@${user} escribe !TuNombreInGame (30 segundos)`);
  
  applyTranslations();
  startCountdown();
}

function startCountdown() {

  const totalTime = 30;
  const radius = 60;
  const circumference = 2 * Math.PI * radius;

  const progressCircle = document.querySelector(".progress-ring-progress");
  const circleContainer = document.querySelector(".countdown-circle");

  if (progressCircle) {
    progressCircle.style.strokeDasharray = `${circumference}`;
    progressCircle.style.strokeDashoffset = "0";
  }

  countdownInterval = setInterval(() => {

    timeLeft--;

    const cd = document.getElementById("countdownNumber");
    if (cd) {
      cd.textContent = timeLeft;
    }

    // Progreso visual
    if (progressCircle) {
      const progress = (totalTime - timeLeft) / totalTime;
      const offset = circumference * progress;
      progressCircle.style.strokeDashoffset = offset;
    }

    // Cambiar a rojo cuando queden 5s
    if (timeLeft <= 5 && circleContainer) {
      circleContainer.classList.add("countdown-warning");
    }

    // Shake cuando queden 3s
    if (timeLeft <= 3 && circleContainer) {
      circleContainer.classList.add("shake");
    }

    if (timeLeft <= 0) {
      stopCountdown();
      cancelWinner();
    }

  }, 1000);
}

function stopCountdown() {
  clearInterval(countdownInterval);
}

function cancelWinner() {

  waitingForGameName = false;

  // Descalificar
  const loser = participants.find(p => p.user === currentWinner);
  if (loser) {
    loser.eliminated = true;
  }

  renderParticipants();

  sendChatMessage(`@${currentWinner} descalificado por no responder`);

  document.getElementById("winnerScreen").classList.add("hidden");

  currentWinner = null;

  // Esperar un poco y hacer reroll
  drawState = "idle";

setTimeout(() => {
  startRoulette();
}, 800);
}


// ===============================
// Nombre in-game
// ===============================

function showGameName(name) {

  waitingForGameName = false;
  winnerGameName = name;

  const container = document.getElementById("winnerName");

  setHTML(container, `
    <div class="winner-box">
      <div class="winner-title" data-i18n="winner_confirmed"></div>
      <div class="winner-name">${currentWinner}</div>

      <div class="ingame-box">
        <div class="ingame-label" data-i18n="ingame_name"></div>
        <div class="ingame-value">${name}</div>
      </div>

      <div class="winner-actions">
        <button id="copyBtn" class="winner-btn" data-i18n="copy"></button>
        <button id="nextBtn" class="winner-btn primary" data-i18n="choose_prize"></button>
      </div>
    </div>
  `);

  document.getElementById("copyBtn").onclick = () => {
    navigator.clipboard.writeText(name);
  };

  document.getElementById("nextBtn").onclick = () => {

    if (drawState !== "waitingName") return;

    drawState = "spinningPrize"; // ?? ESTADO CORRECTO

    const btn = document.getElementById("nextBtn");
    btn.disabled = true;
    btn.setAttribute("data-i18n","drawing_prize"); applyTranslations();

    setHTML(container, `
  <div class="winner-box">
    <div class="winner-title" data-i18n="drawing_prize_title"></div>
    <div class="winner-name">${currentWinner}</div>

    <div class="overlay-roulette-container">
      <div id="overlayRouletteTrack" class="overlay-roulette-track"></div>
      <div class="overlay-center-line"></div>
    </div>
  </div>
`);

    setTimeout(() => {
      startPrizeRoulette();
    }, 600);
  };
  
  applyTranslations();
}

// ===============================
// Finalizar sorteo
// ===============================

function finishDraw(prize) {
	
	overlayState = {
  winner: currentWinner,
  prize: prize.name
};

  if (!prize) return;

  drawState = "finished";

  const screen = document.getElementById("winnerScreen");
  const winnerContainer = document.getElementById("winnerName");

  screen.classList.remove("hidden");

  if (DEBUG_MODE) {
  console.log("[DEBUG] Premio simulado:", prize.name);
} else {
  sendChatMessage(`@${currentWinner} gano ${prize.name}`);
}

  const winnerObj = participants.find(p => p.user === currentWinner);
  if (winnerObj) {
    winnerObj.eliminated = true;
  }

  renderParticipants();

  addToHistory(currentWinner, prize.name);
  
// 🔥 Immediate awards refresh after prize draw
if (typeof loadAwards === "function") {
  loadAwards().catch(err => {
    console.error("Awards refresh error:", err);
  });
}

  setHTML(winnerContainer, `
    <div class="winner-box">
      <div class="winner-title" data-i18n="winner_final"></div>
      <div class="winner-name">${currentWinner}</div>

      <div class="ingame-box">
        <div class="ingame-label" data-i18n="ingame_name"></div>
        <div class="ingame-value">${winnerGameName}</div>
      </div>

      <div class="winner-prize">${prize.name}</div>

      <button id="resetBtn" class="winner-btn" data-i18n="draw_again"></button>
    </div>
  `);

  applyTranslations();

requestAnimationFrame(()=>{
  setTimeout(()=>{
    launchConfetti();
  },80);
});

document.getElementById("resetBtn").onclick = () => {

  stopConfetti(); // ✅ LIMPIA GPU LAYER

  const screen =
    document.getElementById("winnerScreen");

  screen.classList.add("hidden");

  const canvas =
    document.getElementById("confettiCanvas");

  if(canvas){
    canvas.width = 0;
    canvas.height = 0;
  }

  winnerContainer.innerHTML = "";

  currentWinner = null;
  winnerGameName = null;
  drawState = "idle";
};
  
  applyTranslations();
}


// ===============================
// Util
// ===============================

function weightedRandom(list) {

  const active = list.filter(p => !p.eliminated);
  if (active.length === 0) return null;

  const totalWeight = active.reduce((sum, p) => sum + p.weight, 0);

  const random = Math.random() * totalWeight;

  let cumulative = 0;

  for (const p of active) {
    cumulative += p.weight;
    if (random < cumulative) {
      return p;
    }
  }

  return active[active.length - 1];
}

function sendChatMessage(message) {

  if (DEBUG_MODE) {
    console.log("[DEBUG CHAT]:", message);
    return;
  }

  if (!twitchSocket) return;
  twitchSocket.send(`PRIVMSG #${config.channel} :${message}`);
}

(async () => {

  await loadConfig();

  if(config.theme){
    applyTheme(config.theme);
  } // 🔥 SIEMPRE PRIMERO

  const historyPath =
    path.join(userPath,"history.json");

  if (fs.existsSync(historyPath)) {
    winners = JSON.parse(
      fs.readFileSync(historyPath,"utf-8")
    );
  }

  await loadLanguage(
    config.language || "es"
  );

  // ✅ AHORA config YA EXISTE
  startAwardsAutoRefresh();

  renderHistory();

  if (!DEBUG_MODE) {
    connectTwitch();
  } else {
    console.log(
      "DEBUG MODE activo"
    );
  }

})();

document.addEventListener("DOMContentLoaded", async () => {
  initThemeEditor();

  // ===============================
  // WINDOW CONTROLS
  // ===============================
  
  const discordInput = document.getElementById("discordWebhookInput");

  if (discordInput && config.discordWebhook) {
  discordInput.value = config.discordWebhook;
  }

  const minBtn = document.getElementById("minBtn");
  const closeBtn = document.getElementById("closeBtn");

  minBtn?.addEventListener("click", () => {
    ipcRenderer.send("window-minimize");
  });

  closeBtn?.addEventListener("click", () => {
    ipcRenderer.send("window-close");
  });

  // ===============================
  // STREAM MODE BUTTON
  // ===============================

const streamBtn =
  document.getElementById("streamModeBtn");

let streamMode =
  config.streamMode || false;

function updateStreamButton(){

  if(!streamBtn) return;

  if(streamMode){
    streamBtn.textContent =
      "🎥 Stream Mode";
    streamBtn.classList.add("active");
  }else{
    streamBtn.textContent =
      "🖥 Normal Mode";
    streamBtn.classList.remove("active");
  }
}

// ✅ SOLO actualizar UI al iniciar
updateStreamButton();


// ===============================
// CLICK STREAM MODE
// ===============================

let streamBusy = false;

streamBtn?.addEventListener("click", async () => {

  if (streamBusy) return;

  streamBusy = true;

  ipcRenderer.send(
    "save-participants",
    participants
  );

  streamMode = !streamMode;

  config.streamMode = streamMode;

  fs.writeFileSync(
    path.join(userPath,"config.json"),
    JSON.stringify(config,null,2)
  );

  updateStreamButton();

  await ipcRenderer.invoke(
    "toggle-stream-mode",
    streamMode
  );
});

  // ===============================
  // LANGUAGE
  // ===============================

  const langFlag =
    document.getElementById("langFlag");

  const langCode =
    document.getElementById("langCode");

  const langSelected =
    document.getElementById("langSelected");

  const langOptions =
    document.getElementById("langOptions");

  if (langFlag && langCode) {

    const lang =
      config.language || "es";

    langFlag.src =
      getResourcePath("assets", `${lang}.png`);

    langCode.textContent =
      lang.toUpperCase();
  }

  // ✅ abrir dropdown idioma
langSelected?.addEventListener("mousedown",(e)=>{

  e.preventDefault();
  e.stopPropagation();

  langOptions?.classList.toggle("hidden");

});

  // ✅ seleccionar idioma
  document.querySelectorAll(".lang-option")
  .forEach(opt => {

    opt.addEventListener(
  "mousedown",
      async () => {

        const newLang =
          opt.dataset.lang;

        config.language = newLang;

        fs.writeFileSync(
          path.join(userPath,"config.json"),
          JSON.stringify(config,null,2)
        );

        langFlag.src =
          getResourcePath(
            "assets",
            `${newLang}.png`
          );

        langCode.textContent =
          newLang.toUpperCase();

        langOptions.classList.add("hidden");

        await loadLanguage(newLang);

        renderParticipants();
        renderHistory();
      }
    );
  });
  
  document.addEventListener("mousedown",(e)=>{

  if(
    !langSelected.contains(e.target) &&
    !langOptions.contains(e.target)
  ){
    langOptions.classList.add("hidden");
  }

});

  const addDebugBtn =
    document.getElementById("addDebugUserBtn");

  const generateBtn =
    document.getElementById("generateFakeUsersBtn");

  addDebugBtn?.addEventListener(
    "click",
    () => {

      if (!DEBUG_MODE) return;

      const name =
        document.getElementById("debugUserName")
        .value.trim();

      const role =
        document.getElementById("debugUserRole")
        .value;

      addDebugUser(name, role);

      document.getElementById(
        "debugUserName"
      ).value = "";
    }
  );
  
  try {

  const saved =
    await ipcRenderer.invoke(
      "get-participants"
    );

  if (saved && saved.length) {
    participants = saved;
    renderParticipants();
  }

}catch(e){
  console.error("Restore participants failed",e);
}

  generateBtn?.addEventListener(
    "click",
    () => {

      if (!DEBUG_MODE) return;

      const roles =
        ["normal","sub","vip","mod"];

      for (let i=0;i<20;i++){

        const randomRole =
          roles[Math.floor(
            Math.random()*roles.length
          )];

        const randomName =
          "User_" +
          Math.floor(Math.random()*9999);

        addDebugUser(
          randomName,
          randomRole
        );
      }
    }
  );

});


  // ===============================
  // SETTINGS NAVIGATION
  // ===============================

  const mainView =
    document.getElementById("mainView");

  const settingsView =
    document.getElementById("settingsView");

  const openBtn =
    document.getElementById("openSettingsBtn");

  const saveBtn =
    document.getElementById("saveSettingsBtn");


  // ---------- GUARDAR ----------

  saveBtn?.addEventListener(
    "click",
    () => {

      config.oauth =
        document.getElementById("oauthInput")?.value.trim() || "";

      config.channel =
        document.getElementById("channelInput")?.value.trim() || "";

      config.command =
        document.getElementById("commandInput")?.value.trim() || "";

      config.dv =
        document.getElementById("dvInput")?.value
          .trim()
          .replace(/\s+/g,"")
          .replace(/[^\w\-]/g,"") || "";

      config.apiKey =
        document.getElementById("apiKeyInput")?.value.trim() || "";

      config.debug =
        document.getElementById("debugModeToggle")?.checked || false;

      DEBUG_MODE = config.debug;

      
	  
      fs.writeFileSync(
        path.join(userPath,"config.json"),
        JSON.stringify(config,null,2)
      );

      settingsView.classList.remove("active");
      mainView.classList.add("active");

      if (twitchSocket) {
        try { twitchSocket.close(); }
        catch {}
      }

      connectTwitch();
    }
  );


  // ---------- ABRIR SETTINGS ----------

  openBtn?.addEventListener(
    "click",
    () => {

      mainView.classList.remove("active");
      settingsView.classList.add("active");

      document.getElementById("oauthInput").value =
        config.oauth || "";

      document.getElementById("channelInput").value =
        config.channel || "";

      document.getElementById("commandInput").value =
        config.command || "";

      document.getElementById("dvInput").value =
        config.dv || "";

      document.getElementById("apiKeyInput").value =
        config.apiKey || "";

      const debugToggle =
        document.getElementById("debugModeToggle");

      if (debugToggle)
        debugToggle.checked =
          config.debug || false;

      DEBUG_MODE =
        config.debug || false;

      
    }
  );

  loadLanguage(
    config.language || "es"
  );
	  
	  // ================= TOGGLE PASSWORD =================

document.querySelectorAll(".toggle-password").forEach(btn => {
  btn.addEventListener("click", () => {
    const inputId = btn.getAttribute("data-target");
    const input = document.getElementById(inputId);

    if (!input) return;

    if (input.type === "password") {
      input.type = "text";
      btn.setAttribute("data-i18n","hide"); applyTranslations();
    } else {
      input.type = "password";
      btn.setAttribute("data-i18n","show"); applyTranslations();
    }
  });
});

      // Cargar valores actuales
      const oauthInput = document.getElementById("oauthInput");
      const channelInput = document.getElementById("channelInput");
      const commandInput = document.getElementById("commandInput");
      const dvInput = document.getElementById("dvInput");
      const apiKeyInput = document.getElementById("apiKeyInput");

      if (oauthInput) oauthInput.value = config.oauth || "";
      if (channelInput) channelInput.value = config.channel || "";
      if (commandInput) commandInput.value = config.command || "";
      if (dvInput) dvInput.value = config.dv || "";
      if (apiKeyInput) apiKeyInput.value = config.apiKey || "";
    
  

  // --- VOLVER ---
  if (backBtn && mainView && settingsView) {
    backBtn.addEventListener("click", () => {
      settingsView.classList.remove("active");
      mainView.classList.add("active");
    });
  }
  
// A?adir al historial de ganadores 

function addToHistory(user, prize) {

  const entry = {
    user,
    prize,
    ingame: winnerGameName || "-",
    date: new Date().toLocaleString()
  };

  winners.unshift(entry);

  // ?? MÃÂ¨ÃÂ¢ximo 50 entradas
  winners = winners.slice(0, 50);

  try {
    fs.writeFileSync(path.join(userPath,"history.json"), JSON.stringify(winners, null, 2));
  } catch (err) {
    console.error("Error guardando history.json", err);
  }

  renderHistory();
}

function renderHistory() {
  const container = document.getElementById("history");
  container.innerHTML = "";

  if (!winners || winners.length === 0) {
    setHTML(container, `<div class="history-empty" data-i18n="no_draws"></div>`);
    return;
  }

  winners.forEach(w => {
    const div = document.createElement("div");
    div.classList.add("history-item");

    div.innerHTML = `
  <div class="history-main">
    <span class="history-user">${w.user}</span>
    <span class="history-separator">-</span>
    <span class="history-prize">${w.prize}</span>
  </div>

  <div class="history-details">
    <div class="history-details-inner">
      <div><strong data-i18n="ingame_label"></strong> ${w.ingame || "ÃÂ¡ÃÂª"}</div>
      <div>${w.date || ""}</div>
    </div>
  </div>
`;

    div.addEventListener("click", () => {
      div.classList.toggle("expanded");
    });

    container.appendChild(div);
  });
}

document.getElementById("clearHistoryBtn")?.addEventListener("click", () => {

  winners = [];

  try {
    fs.writeFileSync(path.join(userPath,"history.json"), JSON.stringify([], null, 2));
  } catch (err) {
    console.error("Error limpiando historial", err);
  }

  renderHistory();
});

//PROBAR CONEXION EN SETTINGS 

document.getElementById("testTwitch").onclick = () => {
  const status = document.getElementById("apiStatus");

  if (twitchSocket && twitchSocket.readyState === 1) {
    status.setAttribute("data-i18n","twitch_connected"); status.innerHTML=""; applyTranslations();
    status.className = "api-status api-ok";
  } else {
    status.setAttribute("data-i18n","twitch_not_connected"); status.innerHTML=""; applyTranslations();
    status.className = "api-status api-error";
  }
};

document.getElementById("testMu").onclick =
async () => {

  const status =
    document.getElementById("apiStatus");

  try {

    const response =
      await ipcRenderer.invoke(
        "get-awards",
        config
      );

    // ❌ error real
    if (response?.error) {

      status.textContent =
        "❌ Error conexión API";

      status.className =
        "api-status api-error";

      return;
    }

    // ✅ API responde aunque no haya premios
    if (Array.isArray(response)) {

      if (response.length > 0) {

        status.textContent =
          "✅ API conectada (premios disponibles)";

      } else {

        status.textContent =
          "✅ API conectada (sin premios)";
      }

      status.className =
        "api-status api-ok";

      return;
    }

    throw new Error("Respuesta inválida");

  } catch (err) {

    console.error(err);

    status.textContent =
      "❌ Error conexión API";

    status.className =
      "api-status api-error";
  }
};

function addDebugUser(name, role) {

  if (!name) return;

  if (participants.find(p => p.user === name)) return;

  let weight = 1;
  let badges = "";

  if (role === "sub") {
    weight = 2;
    badges = "subscriber";
  }

  if (role === "vip") {
    weight = 2;
    badges = "vip";
  }

  if (role === "mod") {
    weight = 2;
    badges = "moderator";
  }

  participants.push({
    user: name,
    weight,
    userBadges: badges
  });

  renderParticipants();
}

//IDIOMAS

async function loadLanguage(lang) {

  if (!lang) lang = "es";
  currentLanguage = lang;

  try {

    const file =
      getResourcePath("locales", `${lang}.json`);

    const response =
      await fetch(`file://${file}`);

    translations = await response.json();

    applyTranslations();

  } catch (err) {
    console.error("Error cargando idioma:", err);
  }
}

function applyTranslations() {
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.dataset.i18n;
    if (!translations[key]) return;
    el.innerHTML = translations[key];
  });
}

function setHTML(el, html) {
  if (!el) return;
  el.innerHTML = html;
  applyTranslations();
}

///CONFETTI Winner

let confettiParticles = [];
let confettiRunning = false;
let confettiRAF = null;

function launchConfetti(){

  const canvas =
    document.getElementById("confettiCanvas");

  if(!canvas) return;

  const ctx =
    canvas.getContext("2d");

  // ✅ evitar doble lanzamiento
  if(confettiRunning) return;

  // ✅ esperar a que Electron renderice
  requestAnimationFrame(()=>{

    const rect =
      canvas.getBoundingClientRect();

    if(rect.width === 0 || rect.height === 0){
      console.warn("Confetti canvas size 0");
      return;
    }

    canvas.width = rect.width;
    canvas.height = rect.height;

    confettiParticles = [];

    for(let i=0;i<150;i++){
      confettiParticles.push({
        x: Math.random()*canvas.width,
        y: Math.random()*-canvas.height,
        size: Math.random()*8+4,
        speedY: Math.random()*3+2,
        speedX: Math.random()*2-1,
        rotation: Math.random()*360,

        // ✅ color fijo (NO recalcular cada frame)
        color:`hsl(${Math.random()*360},80%,60%)`
      });
    }

    confettiRunning = true;

    animateConfetti(ctx,canvas);

    // ✅ auto stop limpio
    setTimeout(()=>{
      confettiRunning=false;
    },5000);

  });
}

function animateConfetti(ctx,canvas){

  if(!confettiRunning){
    ctx.clearRect(
      0,
      0,
      canvas.width,
      canvas.height
    );

    cancelAnimationFrame(confettiRAF);
    confettiRAF = null;
    return;
  }

  ctx.clearRect(
    0,
    0,
    canvas.width,
    canvas.height
  );

  confettiParticles.forEach(p=>{

    p.y += p.speedY;
    p.x += p.speedX;
    p.rotation += 5;

    // reciclar partículas
    if(p.y > canvas.height){
      p.y = -20;
      p.x = Math.random()*canvas.width;
    }

    ctx.save();

    ctx.translate(p.x,p.y);
    ctx.rotate(p.rotation*Math.PI/180);

    ctx.fillStyle = p.color;

    ctx.fillRect(
      -p.size/2,
      -p.size/2,
      p.size,
      p.size
    );

    ctx.restore();
  });

  confettiRAF =
    requestAnimationFrame(
      ()=>animateConfetti(ctx,canvas)
    );
}

function stopConfetti(){

  confettiRunning = false;

  const canvas =
    document.getElementById("confettiCanvas");

  if(!canvas) return;

  const ctx = canvas.getContext("2d");

  ctx.clearRect(
    0,
    0,
    canvas.width,
    canvas.height
  );
}

/* =====================================================
   DISCORD WEBHOOK (TITLEBAR)
=====================================================*/

function buildLiveMessage(){
  return `🔴 ${translations["live"] || "Live"}
Canal: ${config.channel}
Comando: ${config.command}`;
}

function buildPrizeMessage(){
  const prizeList = awards.map(a => `- ${a.name}`).join("\n");
  return `🎁 NUEVO SORTEO\nCanal: ${config.channel}\nComando: ${config.command}\nPremios:\n${prizeList}`;
}

async function sendDiscord(type){

  const webhook = type === "live"
    ? config.discordLiveWebhook
    : config.discordPrizeWebhook;

  if(typeof webhook !== "string" || webhook.trim().length < 20){
    console.warn("Webhook no configurado");
    return;
  }

  let embed;

  if(type === "live"){

    embed = {
      title: "🔴 ¡Estamos "+(translations["live"]||"Live")+"!",
      description: `El stream ha comenzado.`,
      color: 16711680, // rojo
      fields: [
        {
          name: "📺 Canal",
          value: config.channel,
          inline: true
        },
        {
          name: "💬 Comando",
          value: config.command,
          inline: true
        }
      ]
    };

  } else {

    const prizeList =
      awards.map(a => `• **${a.name}**`).join("\n");

    embed = {
      title: "🎁 ¡Nuevo Sorteo Activo!",
      description: "Participa ahora en el sorteo:",
      color: 5814783, // morado Twitch
      fields: [
        {
          name: "📺 Canal",
          value: config.channel,
          inline: true
        },
        {
          name: "💬 Comando",
          value: config.command,
          inline: true
        },
        {
          name: "🏆 Premios Disponibles",
          value: prizeList || "Sin premios",
          inline: false
        }
      ]
    };
  }

  const response = await ipcRenderer.invoke("send-discord",{
    type,
    webhook,
    embed
  });

  if(response?.error){
    console.warn(response.message);
  }
}

document.addEventListener("DOMContentLoaded",()=>{

  const liveBtn = document.getElementById("discordLiveBtn");
  const prizeBtn = document.getElementById("discordPrizeBtn");

  liveBtn?.addEventListener("click",()=>sendDiscord("live"));
  prizeBtn?.addEventListener("click",()=>sendDiscord("prize"));

  const liveInput = document.getElementById("discordLiveWebhookInput");
  const prizeInput = document.getElementById("discordPrizeWebhookInput");

  if(liveInput && config.discordLiveWebhook){
    liveInput.value = config.discordLiveWebhook;
  }

  if(prizeInput && config.discordPrizeWebhook){
    prizeInput.value = config.discordPrizeWebhook;
  }

  const saveBtn = document.getElementById("saveSettingsBtn");

  saveBtn?.addEventListener("click",()=>{
    config.discordLiveWebhook = liveInput?.value.trim() || "";
    config.discordPrizeWebhook = prizeInput?.value.trim() || "";
  });

});


/* =====================================================
   HEADER BUTTON UX CONTROL
=====================================================*/

document.addEventListener("DOMContentLoaded",()=>{

  const liveBtn = document.getElementById("liveBtn");
  const announceBtn = document.getElementById("announceBtn");

  let liveActive = false;
  
    liveActive = !liveActive;

    if(liveActive){
      liveBtn.classList.remove("live-idle");
      liveBtn.classList.add("live-active");
      liveBtn.innerHTML =
  '<span class="live-dot"></span> ' +
  (translations["live"] || "Live");
    }else{
      liveBtn.classList.remove("live-active");
      liveBtn.classList.add("live-idle");
      liveBtn.innerHTML = '<span class="live-dot"></span> Live';
    }
  });

  announceBtn?.addEventListener("click", async ()=>{

    await sendDiscord("prize");

    announceBtn.classList.add("announce-sent");

    setTimeout(()=>{
      announceBtn.classList.remove("announce-sent");
    },500);

  });


/* =====================================================
   STREAM MODE CLASS APPLY
=====================================================*/

document.addEventListener("DOMContentLoaded", () => {
  if (config.streamMode) {
    document.body.classList.add("stream-mode");
  }
});


/* =====================================================
   AWARD TOGGLE SYSTEM
=====================================================*/

function renderAwards() {

  const container = document.getElementById("awards");
  if (!container) return;

  container.innerHTML = "";

  awards.forEach((a, index) => {

    if (typeof a.disabled === "undefined") {
      a.disabled = false;
    }

    const div = document.createElement("div");
    div.style.display = "flex";
    div.style.justifyContent = "space-between";
    div.style.alignItems = "center";

    if (a.disabled) {
      div.classList.add("award-disabled");
    }

    const name = document.createElement("span");
    name.textContent = a.name;

    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.checked = !a.disabled;

    toggle.addEventListener("change", () => {
      awards[index].disabled = !toggle.checked;
      renderAwards();
    });

    div.appendChild(name);
    div.appendChild(toggle);

    container.appendChild(div);
  });
}


/* =====================================================
   OVERRIDE PRIZE ROULETTE WITH FILTER
=====================================================*/

function startPrizeRoulette() {

  const availableAwards = awards.filter(a => !a.disabled);

  if (!availableAwards || availableAwards.length === 0) {
    drawState = "waitingName";
    return;
  }

  if (availableAwards.length === 1) {

    drawState = "spinningPrize";
    const prize = availableAwards[0];

    setTimeout(() => {
      finishDraw(prize);
    }, 500);

    return;
  }

  drawState = "spinningPrize";

  let prize;

  if (DEBUG_MODE && forcedPrize) {
    prize = availableAwards.find(a => a.name === forcedPrize);
  } else {
    prize = availableAwards[Math.floor(Math.random() * availableAwards.length)];
  }

  if (!prize) {
    drawState = "waitingName";
    return;
  }

  const track = document.getElementById("overlayRouletteTrack");
  const container = document.querySelector(".overlay-roulette-container");

  if (!track || !container) {
    drawState = "waitingName";
    return;
  }

  track.style.transition = "none";
  track.style.transform = "translateX(0)";
  track.innerHTML = "";

  const visualList = [];

  for (let i = 0; i < 120; i++) {
    visualList.push(
      availableAwards[Math.floor(Math.random() * availableAwards.length)]
    );
  }

  const winnerIndex = visualList.length;
  visualList.push(prize);

  for (let i = 0; i < 120; i++) {
    visualList.push(
      availableAwards[Math.floor(Math.random() * availableAwards.length)]
    );
  }

  visualList.forEach(a => {
    const div = document.createElement("div");
    div.classList.add("roulette-item");
    div.textContent = a.name;
    track.appendChild(div);
  });

  requestAnimationFrame(() => {

    const items = track.querySelectorAll(".roulette-item");
    const winnerElement = items[winnerIndex];

    if (!winnerElement) {
      drawState = "waitingName";
      return;
    }

    const containerWidth = container.offsetWidth;
    const winnerWidth = winnerElement.offsetWidth;
    const winnerOffset = winnerElement.offsetLeft;

    const finalPosition =
      winnerOffset - (containerWidth / 2) + (winnerWidth / 2);

    track.style.transition =
      "transform 5s cubic-bezier(0.1, 0.7, 0.1, 1)";

    track.style.transform =
      `translateX(-${finalPosition}px)`;

    setTimeout(() => {
      finishDraw(prize);
    }, 5200);

  });
}

/* =====================================================
   "+(translations.get("debug_panel","Debug Panel"))+" ACTIONS
=====================================================*/

function initDebugPanel(){
	
	const forceBtn = document.getElementById("forceCommandBtn");

    if(forceBtn){
    forceBtn.addEventListener("click", () => {

    if(!DEBUG_MODE) return;

    if(drawState !== "waitingName") {
      console.log("No hay ganador esperando comando");
      return;
    }

    if(!currentWinner) return;

    winnerGameName = currentWinner + "_Debug";

    stopCountdown();

    showGameName(winnerGameName);

    console.log("Comando forzado para:", winnerGameName);
  });
}
	
	
  const resetBtn = document.getElementById("resetCooldownBtn");

  if(resetBtn){
  resetBtn.onclick = () => {

    ipcRenderer.send("reset-discord-cooldowns");

    // 🔥 Animación visual elegante
    resetBtn.classList.add("debug-success");

    resetBtn.textContent = "Cooldowns Reset ✓";

    setTimeout(() => {
      resetBtn.classList.remove("debug-success");
      resetBtn.textContent = "Reset Discord Cooldowns";
    }, 1500);

  };
}
  const addBtn = document.getElementById("addDebugUserBtn");
  const fakeBtn = document.getElementById("generateFakeUsersBtn");

  if(addBtn){
    addBtn.addEventListener("click", () => {

      if(!DEBUG_MODE) {
        console.log("DEBUG desactivado en config");
        return;
      }

      const name = "DebugUser_" + Math.floor(Math.random()*1000);

      addParticipant(name, "");
      console.log("Debug user added:", name);
    });
  }

  if(fakeBtn){
    fakeBtn.addEventListener("click", () => {

      if(!DEBUG_MODE) return;

      for(let i=0;i<20;i++){
        const name = "Fake_" + Math.floor(Math.random()*10000);
        addParticipant(name, "");
      }

      console.log("20 fake users generated");
    });
  }

}

// Ejecutar inmediatamente
document.addEventListener("DOMContentLoaded", initDebugPanel);
/* =====================================================
   FEATURE: Extended Theme Presets
===================================================== */

function applyPresetTheme(name){

 const presets={

  twitch:{
   accent:"#9146ff",
   background:"#0f0f0f",
   panel:"#141414",
   text:"#ffffff",
   highlight:"#a970ff"
  },

  cyberpunk:{
   accent:"#ff2fd1",
   background:"#050505",
   panel:"#111111",
   text:"#ffffff",
   highlight:"#00ffff"
  },

  gold:{
   accent:"#d4af37",
   background:"#0b0b0b",
   panel:"#141414",
   text:"#ffffff",
   highlight:"#ffd700"
  },

  emerald:{
   accent:"#00c896",
   background:"#0b0b0b",
   panel:"#121212",
   text:"#ffffff",
   highlight:"#00ffc3"
  },

  ruby:{
   accent:"#ff003c",
   background:"#0b0b0b",
   panel:"#121212",
   text:"#ffffff",
   highlight:"#ff335f"
  },

  ocean:{
   accent:"#1da1f2",
   background:"#0f1115",
   panel:"#12151a",
   text:"#ffffff",
   highlight:"#3ec5ff"
  },

  neon:{
   accent:"#8a2be2",
   background:"#0c0c0c",
   panel:"#111111",
   text:"#ffffff",
   highlight:"#c77dff"
  },

  solar:{
   accent:"#ffb703",
   background:"#111111",
   panel:"#141414",
   text:"#ffffff",
   highlight:"#ffd166"
  },

  matrix:{
   accent:"#00ff88",
   background:"#050505",
   panel:"#0a0a0a",
   text:"#ffffff",
   highlight:"#00ff88"
  },

  sunset:{
   accent:"#ff6b35",
   background:"#121212",
   panel:"#161616",
   text:"#ffffff",
   highlight:"#ff9e64"
  },

  midnight:{
   accent:"#5c6bc0",
   background:"#0a0a0a",
   panel:"#111111",
   text:"#ffffff",
   highlight:"#7986cb"
  },

  sakura:{
   accent:"#ff77a9",
   background:"#121212",
   panel:"#161616",
   text:"#ffffff",
   highlight:"#ff9cc2"
  },

  ice:{
   accent:"#6ee7ff",
   background:"#0c1114",
   panel:"#11181c",
   text:"#ffffff",
   highlight:"#aaf3ff"
  }

 };

 const theme=presets[name];
 if(!theme) return;

 config.theme={...theme};
 applyTheme(config.theme);

}



/* =====================================================
   FEATURE: Theme Editor Live Update
   Description:
   Apply theme immediately when color inputs change.
===================================================== */
function initThemeEditor(){

  const accent=document.getElementById("themeAccent");
  const bg=document.getElementById("themeBackground");
  const panel=document.getElementById("themePanel");
  const text=document.getElementById("themeText");
  const highlight=document.getElementById("themeHighlight");

  const inputs=[accent,bg,panel,text,highlight];

  inputs.forEach(inp=>{
    if(!inp) return;

    inp.addEventListener("input",()=>{

      config.theme=config.theme||{};

      config.theme.accent=accent?.value;
      config.theme.background=bg?.value;
      config.theme.panel=panel?.value;
      config.theme.text=text?.value;
      config.theme.highlight=highlight?.value;

      applyTheme(config.theme);
    });
  });

}

document.addEventListener("DOMContentLoaded",()=>{
  initThemeEditor();
});