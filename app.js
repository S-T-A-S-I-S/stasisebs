// app.js — Cloudflare Worker + KV live sync (OBS/vMix safe)
// Control panel writes via HTTPS POST, Overlay polls via HTTPS GET.
// Fixes cursor being kicked out by NEVER syncing/rebuilding while the user is typing.

const API = "https://stasisebs.2024mmorgan.workers.dev/state?key=playerOverlay";
const OVERLAY_KEY = ""; // OPTIONAL: if you set OVERLAY_KEY in Cloudflare Worker, set it here too.

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
    // allow mode to be string or number
    const m = Number(s.mode);
    if (Number.isFinite(m)) out.mode = clamp(m, 1, 6);

    if (Array.isArray(s.players)) {
      for (let i = 0; i < 6; i++) {
        if (s.players[i]) {
          out.players[i].name = String(s.players[i].name ?? out.players[i].name);
          out.players[i].user = String(s.players[i].user ?? out.players[i].user);
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

// Are we currently editing a field? If yes, DO NOT touch DOM.
function isEditing() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = (el.tagName || "").toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable === true;
}

// -------------------- Overlay Rendering --------------------
async function waitForFonts() {
  try {
    if (document.fonts && document.fonts.status !== "loaded") {
      await document.fonts.ready;
    }
  } catch (_) {}
}

function fitTextToWidth(el, maxPx) {
  let size = parseFloat(getComputedStyle(el).fontSize) || 34;

  const MIN = 16;
  const MAX = 36;

  size = Math.min(MAX, size);
  el.style.fontSize = size + "px";

  for (let i = 0; i < 60; i++) {
    if (el.scrollWidth <= maxPx || size <= MIN) break;
    size -= 1;
    el.style.fontSize = size + "px";
  }

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
  bg.src = `${10 + mode}.png`; // 11..16

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
    line.style.fontFamily = "Edo, edo, 'Edo', sans-serif";

    slot.appendChild(line);
    slots.appendChild(slot);

    const maxTextWidth = b.w - 26 - 78;
    fitTextToWidth(line, maxTextWidth);
  });
}

// -------------------- Control Panel (Stable) --------------------
let controlState = structuredClone(defaults);
let lastModeBuilt = null;

function buildControlUIForMode(mode) {
  const modeSel = document.getElementById("mode");
  const playersWrap = document.getElementById("players");
  if (!modeSel || !playersWrap) return;

  modeSel.value = String(mode);
  playersWrap.innerHTML = "";

  for (let i = 0; i < mode; i++) {
    const card = document.createElement("div");
    card.className = "playerCard";

    const h = document.createElement("h3");
    h.textContent = `PLAYER ${i + 1}`;
    card.appendChild(h);

    const nameLab = document.createElement("label");
    nameLab.innerHTML = `Player Name
      <input id="p${i}-name" type="text" autocomplete="off" spellcheck="false">`;
    card.appendChild(nameLab);

    const userLab = document.createElement("label");
    userLab.innerHTML = `Username
      <input id="p${i}-user" type="text" autocomplete="off" spellcheck="false">`;
    card.appendChild(userLab);

    playersWrap.appendChild(card);
  }

  // Mode selector (write to KV)
  modeSel.onchange = () => {
    const next = normalizeState(controlState);
    next.mode = clamp(Number(modeSel.value), 1, 6);
    controlState = next;
    apiPostDebounced(next);
  };

  // Inputs (write to KV)
  for (let i = 0; i < mode; i++) {
    const nameInp = document.getElementById(`p${i}-name`);
    const userInp = document.getElementById(`p${i}-user`);

    nameInp.addEventListener("input", () => {
      const next = normalizeState(controlState);
      next.players[i].name = nameInp.value;
      controlState = next;
      apiPostDebounced(next);
    });

    userInp.addEventListener("input", () => {
      const next = normalizeState(controlState);
      next.players[i].user = userInp.value;
      controlState = next;
      apiPostDebounced(next);
    });
  }

  // Buttons
  const demoBtn = document.getElementById("fillDemo");
  const resetBtn = document.getElementById("reset");

  if (demoBtn) {
    demoBtn.onclick = () => {
      const next = normalizeState(controlState);
      next.players = next.players.map((_, idx) => ({
        name: ["MONTANA", "ALEX", "JORDAN", "RILEY", "CASEY", "SKY"][idx] || `PLAYER ${idx + 1}`,
        user: ["ITZDIRT", "ACE", "J0RD", "R1LEY", "C4SEY", "SKYNET"][idx] || `USER${idx + 1}`,
      }));
      controlState = next;
      apiPostDebounced(next);
      applyStateToControlInputs(next);
    };
  }

  if (resetBtn) {
    resetBtn.onclick = () => {
      const next = structuredClone(defaults);
      controlState = next;
      apiPostDebounced(next);
      applyStateToControlInputs(next);
    };
  }

  // Immediately fill values after building
  applyStateToControlInputs(controlState);
}

function applyStateToControlInputs(state) {
  const mode = clamp(state.mode, 1, 6);

  const modeSel = document.getElementById("mode");
  if (modeSel && !isEditing()) {
    modeSel.value = String(mode);
  }

  for (let i = 0; i < mode; i++) {
    const nameInp = document.getElementById(`p${i}-name`);
    const userInp = document.getElementById(`p${i}-user`);
    if (!nameInp || !userInp) continue;

    // Do not ever overwrite while editing ANY field
    if (isEditing()) return;

    const nameV = state.players[i]?.name ?? "";
    const userV = state.players[i]?.user ?? "";

    if (nameInp.value !== nameV) nameInp.value = nameV;
    if (userInp.value !== userV) userInp.value = userV;
  }
}

// -------------------- Live Loops --------------------
let lastOverlayJson = "";

async function overlayLoop() {
  try {
    const state = await apiGet();
    const json = JSON.stringify(state);

    if (json !== lastOverlayJson) {
      lastOverlayJson = json;
      await waitForFonts();
      renderOverlay(state);
    }
  } catch (e) {
    console.warn("Overlay GET error:", e);
  } finally {
    setTimeout(overlayLoop, 250);
  }
}

async function controlSyncLoop() {
  try {
    // If user is typing, do NOT fetch + do NOT touch UI.
    // This prevents focus/cursor being stolen in some embedded Chromium environments.
    if (isEditing()) {
      setTimeout(controlSyncLoop, 600);
      return;
    }

    const remote = await apiGet();
    controlState = remote;

    const mode = clamp(remote.mode, 1, 6);

    // Only rebuild UI when mode changes (and not editing)
    if (lastModeBuilt !== mode) {
      lastModeBuilt = mode;
      buildControlUIForMode(mode);
    } else {
      // Otherwise safely apply values (not editing)
      applyStateToControlInputs(remote);
    }
  } catch (e) {
    console.warn("Control sync GET error:", e);
  } finally {
    setTimeout(controlSyncLoop, 900); // slower = less jitter, still keeps multi-operator sync
  }
}

// -------------------- Boot --------------------
const isControl = document.body.classList.contains("control");
const isOverlay = document.body.classList.contains("overlay");

(async () => {
  const initial = await apiGet().catch(() => structuredClone(defaults));

  if (isOverlay) {
    lastOverlayJson = JSON.stringify(initial);
    await waitForFonts();
    renderOverlay(initial);
    overlayLoop();
  }

  if (isControl) {
    controlState = initial;
    lastModeBuilt = null; // force first build
    buildControlUIForMode(clamp(initial.mode, 1, 6));
    controlSyncLoop();
  }
})();
