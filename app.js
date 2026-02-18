// app.js — Cloudflare Worker + KV live sync (OBS/vMix safe)
// Control panel writes via HTTPS POST, Overlay polls via HTTPS GET.
// Works on locked-down school networks (no websockets, no local server).

const API = "https://stasisebs.2024mmorgan.workers.dev/state?key=playerOverlay";
const OVERLAY_KEY = ""; // OPTIONAL: set to your secret if you add env var OVERLAY_KEY in Cloudflare Worker

// -------------------- Defaults --------------------
const defaults = {
  mode: 5,
  players: Array.from({ length: 6 }, () => ({
    name: "PLAYER NAME",
    user: "USERNAME",
  })),
};

// Coordinates in 1920x1080 space
const BOXES = {
  1: [{ x: 615, y: 281, w: 690, h: 518 }],
  2: [
    { x: 185, y: 281, w: 691, h: 518 },
    { x: 1036, y: 281, w: 691, h: 518 },
  ],
  3: [
    { x: 146, y: 378, w: 433, h: 324 },
    { x: 744, y: 378, w: 433, h: 324 },
    { x: 1341, y: 378, w: 433, h: 324 },
  ],
  4: [
    { x: 304, y: 159, w: 491, h: 368 },
    { x: 1124, y: 159, w: 492, h: 368 },
    { x: 304, y: 553, w: 491, h: 368 },
    { x: 1124, y: 553, w: 492, h: 368 },
  ],
  5: [
    { x: 146, y: 159, w: 433, h: 324 },
    { x: 744, y: 159, w: 433, h: 324 },
    { x: 1341, y: 159, w: 433, h: 324 },
    { x: 362, y: 601, w: 433, h: 324 },
    { x: 1124, y: 601, w: 433, h: 324 },
  ],
  6: [
    { x: 146, y: 159, w: 433, h: 324 },
    { x: 744, y: 159, w: 433, h: 324 },
    { x: 1341, y: 159, w: 433, h: 324 },
    { x: 146, y: 601, w: 433, h: 324 },
    { x: 744, y: 601, w: 433, h: 324 },
    { x: 1341, y: 601, w: 433, h: 324 },
  ],
};

// -------------------- Helpers --------------------
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function normalizeState(s) {
  const out = structuredClone(defaults);

  if (s && typeof s === "object") {
    if (typeof s.mode === "number") out.mode = clamp(s.mode, 1, 6);

    if (Array.isArray(s.players)) {
      for (let i = 0; i < 6; i++) {
        if (s.players[i]) {
          out.players[i].name = String(
            s.players[i].name ?? out.players[i].name
          );
          out.players[i].user = String(
            s.players[i].user ?? out.players[i].user
          );
        }
      }
    }
  }

  return out;
}

function headersWithKey(extra = {}) {
  return {
    ...extra,
    ...(OVERLAY_KEY ? { "X-Overlay-Key": OVERLAY_KEY } : {}),
  };
}

async function apiGet() {
  const r = await fetch(API, {
    method: "GET",
    headers: headersWithKey(),
    cache: "no-store",
  });

  if (!r.ok) throw new Error(`GET failed: ${r.status}`);

  const txt = await r.text();
  try {
    return normalizeState(JSON.parse(txt || "{}"));
  } catch {
    return structuredClone(defaults);
  }
}

// Debounced POST to avoid spamming on every keystroke
let postTimer = null;
let latestToPost = null;

function apiPostDebounced(state) {
  latestToPost = state;
  if (postTimer) return;

  postTimer = setTimeout(async () => {
    const payload = latestToPost;
    latestToPost = null;
    postTimer = null;

    try {
      await fetch(API, {
        method: "POST",
        headers: headersWithKey({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload),
      });
    } catch (e) {
      console.warn("POST error:", e);
    }
  }, 120);
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// -------------------- Overlay Rendering --------------------
function fitTextToWidth(el, maxPx) {
  let size = parseFloat(getComputedStyle(el).fontSize) || 34;

  const MIN = 16; // allow tighter fit for long names
  const MAX = 36;

  size = Math.min(MAX, size);
  el.style.fontSize = size + "px";

  for (let i = 0; i < 60; i++) {
    if (el.scrollWidth <= maxPx || size <= MIN) break;
    size -= 1;
    el.style.fontSize = size + "px";
  }

  // If still overflowing, hard clamp with ellipsis as a last resort
  if (el.scrollWidth > maxPx) {
    el.style.whiteSpace = "nowrap";
    el.style.overflow = "hidden";
    el.style.textOverflow = "ellipsis";
    el.style.maxWidth = maxPx + "px";
  }
}

function renderOverlay(state) {
  const bg = document.getElementById("bg");
  const slots = document.getElementById("slots");
  if (!bg || !slots) return;

  const mode = clamp(state.mode, 1, 6);

  // Your templates: 11.png..16.png
  bg.src = `${10 + mode}.png`;

  slots.innerHTML = "";
  const boxes = BOXES[mode];

  boxes.forEach((b, idx) => {
    const p = state.players[idx] || { name: "PLAYER NAME", user: "USERNAME" };
    const text = `${p.name} | ${p.user}`;

    const slot = document.createElement("div");
    slot.className = "slot";
    slot.style.left = b.x + "px";
    slot.style.top = b.y + "px";
    slot.style.width = b.w + "px";
    slot.style.height = b.h + "px";

    const line = document.createElement("div");
    line.className = "tagline";
    line.textContent = text;

    slot.appendChild(line);
    slots.appendChild(slot);

    // match your padding/logo clearance assumptions
    const maxTextWidth = b.w - 26 - 78;
    fitTextToWidth(line, maxTextWidth);
  });
}

// -------------------- Control Panel UI --------------------
function renderControl(state) {
  const modeSel = document.getElementById("mode");
  const playersWrap = document.getElementById("players");
  if (!modeSel || !playersWrap) return;

  modeSel.value = String(state.mode);
  const mode = clamp(state.mode, 1, 6);

  playersWrap.innerHTML = "";

  for (let i = 0; i < mode; i++) {
    const p = state.players[i] || { name: "PLAYER NAME", user: "USERNAME" };

    const card = document.createElement("div");
    card.className = "playerCard";

    const h = document.createElement("h3");
    h.textContent = `PLAYER ${i + 1}`;
    card.appendChild(h);

    const nameLab = document.createElement("label");
    nameLab.innerHTML = `Player Name
      <input type="text" value="${escapeHtml(p.name)}" data-i="${i}" data-k="name" autocomplete="off">`;
    card.appendChild(nameLab);

    const userLab = document.createElement("label");
    userLab.innerHTML = `Username
      <input type="text" value="${escapeHtml(p.user)}" data-i="${i}" data-k="user" autocomplete="off">`;
    card.appendChild(userLab);

    playersWrap.appendChild(card);
  }

  // input -> push to KV
  playersWrap.querySelectorAll("input").forEach((inp) => {
    inp.addEventListener("input", () => {
      const i = Number(inp.dataset.i);
      const k = inp.dataset.k;

      const next = normalizeState(state);
      next.players[i][k] = inp.value;

      apiPostDebounced(next);
    });
  });

  // mode change -> push to KV
  modeSel.onchange = () => {
    const next = normalizeState(state);
    next.mode = clamp(Number(modeSel.value), 1, 6);
    apiPostDebounced(next);
  };

  // buttons
  const demoBtn = document.getElementById("fillDemo");
  const resetBtn = document.getElementById("reset");

  if (demoBtn) {
    demoBtn.onclick = () => {
      const next = normalizeState(state);
      next.players = next.players.map((_, idx) => ({
        name: ["MONTANA", "ALEX", "JORDAN", "RILEY", "CASEY", "SKY"][idx] || `PLAYER ${idx + 1}`,
        user: ["ITZDIRT", "ACE", "J0RD", "R1LEY", "C4SEY", "SKYNET"][idx] || `USER${idx + 1}`,
      }));
      apiPostDebounced(next);
    };
  }

  if (resetBtn) {
    resetBtn.onclick = () => apiPostDebounced(structuredClone(defaults));
  }
}

// -------------------- Boot + Live Loops --------------------
const isControl = document.body.classList.contains("control");
const isOverlay = document.body.classList.contains("overlay");

let lastJson = "";

async function overlayLoop() {
  try {
    const state = await apiGet();
    const json = JSON.stringify(state);

    // only re-render if something changed
    if (json !== lastJson) {
      lastJson = json;
      renderOverlay(state);
    }
  } catch (e) {
    console.warn("Overlay GET error:", e);
  } finally {
    // 250ms poll = "live enough" and very school-network friendly
    setTimeout(overlayLoop, 250);
  }
}

async function controlSyncLoop() {
  try {
    const state = await apiGet();
    // keep UI synced if another machine edits
    renderControl(state);
  } catch (e) {
    console.warn("Control sync GET error:", e);
  } finally {
    setTimeout(controlSyncLoop, 1000);
  }
}

(async () => {
  // initial load
  const initial = await apiGet().catch(() => structuredClone(defaults));
  lastJson = JSON.stringify(initial);

  if (isOverlay) {
    renderOverlay(initial);
    overlayLoop();
  }

  if (isControl) {
    renderControl(initial);
    controlSyncLoop();
  }
})();
