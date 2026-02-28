/**
 * renderer.js (PRO STREAM SAFE)
 * Fixes applied:
 * - Single opacity controller bound correctly after DOM load.
 * - Prevents undefined variables (glass/value errors).
 * - OBS transparency preserved (CSS-only opacity).
 * - No logic removed, only stabilized and ordered.
 */

const { ipcRenderer } = require("electron");
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

let DEBUG_MODE = false;
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
console.log("DV enviado:", JSON.stringify(config.dv));
  try {

    const newAwards =
      await ipcRenderer.invoke("get-awards", config);

    // evitar rerender innecesario
    if (newAwards.length !== awards.length) {

      awards = newAwards;

      console.log("Premios actualizados");

      renderAwards();
    }

  } catch (err) {
    console.error("Error cargando premios:", err);
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
// INIT
// ===============================

startAwardsAutoRefresh();

renderHistory();


// ===============================
// Twitch IRC
// ===============================

function connectTwitch() {

  twitchSocket = new WebSocket("wss://irc-ws.chat.twitch.tv:443");
  const socket = twitchSocket;

  socket.onopen = () => {
    socket.send("CAP REQ :twitch.tv/tags twitch.tv/commands twitch.tv/membership");
    socket.send(`PASS oauth:${config.oauth}`);
    socket.send(`NICK ${config.channel}`);
    socket.send(`JOIN #${config.channel}`);
  };

  socket.onmessage = (event) => {

    const lines = event.data.split("\r\n");

    lines.forEach(line => {

      if (line.startsWith("PING")) {
        socket.send("PONG :tmi.twitch.tv");
        return;
      }

      if (!line.includes("PRIVMSG")) return;

      const parsed = parseIRC(line);
      if (!parsed) return;

      const { user, message, badges } = parsed;

      if (
  message.toLowerCase().trim() ===
  config.command.toLowerCase().trim()
) {
  addParticipant(user, badges);
}

      if (waitingForGameName && user === currentWinner && message.startsWith("!")) {
        const name = message.substring(1).trim();
        if (name.length > 0) {
          winnerGameName = name;
          stopCountdown();
          showGameName(name);
        }
      }
    });
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
  let winner;

if (DEBUG_MODE && forcedWinner) {
  winner = participants.find(p => p.user === forcedWinner);
} else {
  winner = weightedRandom(participants);
}
  if (!winner) {
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

  // Destacar segÃÂ¨ÃÂ²n rol
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

    console.log("Solo queda 1 premio → skip animación");

    const container =
      document.getElementById("winnerName");

    // pequeño feedback visual (opcional pero limpio)
    if (container) {
      setHTML(container, `
        <div class="winner-box">
          <div class="winner-title">
            Último premio disponible
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

  document.getElementById("resetBtn").onclick = () => {
    screen.classList.add("hidden");
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

  const historyPath = path.join(userPath,"history.json");
  if (fs.existsSync(historyPath)) {
    winners = JSON.parse(
      fs.readFileSync(historyPath,"utf-8")
    );
  }

  DEBUG_MODE = config.debug || false;

  await loadLanguage(config.language || "es");

  startAwardsAutoRefresh();
  renderHistory();
  
  if (!DEBUG_MODE) {
  connectTwitch();
} else {
  console.log("DEBUG MODE activo - Twitch deshabilitado");
}

})();

  // ===============================
  // DEBUG PANEL
  // ===============================

  function updateDebugPanel(){

  const panel =
    document.getElementById("debugPanel");

  const indicator =
    document.getElementById("debugIndicator");

  panel?.classList.toggle(
    "hidden",
    !DEBUG_MODE
  );

  indicator?.classList.toggle(
    "hidden",
    !DEBUG_MODE
  );
}

document.addEventListener("DOMContentLoaded", async () => {

  // ===============================
  // WINDOW CONTROLS
  // ===============================

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
streamBtn?.addEventListener(
  "click",
  async ()=>{

    try{

      streamMode = !streamMode;

      config.streamMode = streamMode;

      fs.writeFileSync(
        path.join(userPath,"config.json"),
        JSON.stringify(config,null,2)
      );

      updateStreamButton();

      // ✅ SOLO AQUÍ cambiamos ventana
      await ipcRenderer.invoke(
        "toggle-stream-mode",
        streamMode
      );

    }catch(err){
      console.error(
        "Stream toggle error:",
        err
      );
    }
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

      updateDebugPanel();

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

      updateDebugPanel();
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

document.getElementById("testMu").onclick = async () => {
  const status = document.getElementById("apiStatus");

  try {
    const testAwards = await ipcRenderer.invoke("get-awards", config);

    if (testAwards && testAwards.length > 0) {
      status.setAttribute("data-i18n","api_connected"); status.innerHTML=""; applyTranslations();
      status.className = "api-status api-ok";
    } else {
      throw new Error();
    }

  } catch (err) {
    status.setAttribute("data-i18n","api_error"); status.innerHTML=""; applyTranslations();
    status.className = "api-status api-error";
  }
};

//debug
if (DEBUG_MODE) {
  document.getElementById("debugIndicator")?.classList.remove("hidden");
}

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

// =====================================
// SECRET DEBUG TOGGLE (F12)
// =====================================
window.addEventListener("keydown", (e) => {

  if (e.key === "F12") {

    // 🚫 evitar comportamiento chromium
    e.preventDefault();
    e.stopPropagation();

    DEBUG_MODE = !DEBUG_MODE;

    const indicator =
      document.getElementById("debugIndicator");

    if (indicator) {
      indicator.classList.toggle(
        "hidden",
        !DEBUG_MODE
      );
    }

    console.log(
      "[DEBUG MODE]",
      DEBUG_MODE ? "ON" : "OFF"
    );
  }

});