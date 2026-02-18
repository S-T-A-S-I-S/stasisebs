// app.js — "Edit locally, SEND button to push" (OBS/vMix safe)
// Control: no autosync, no live posting; only SEND triggers POST.
// Overlay: polls KV every 250ms and updates when state changes.

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

async function apiPost(state) {
  const payload = normalizeState(state);
  const r = await fetch(API, {
    method: "POST",
    headers: headersWithKey({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`POST failed: ${r.status}`);
  return true;
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

// -------------------- Control UI (local draft) --------------------
let draft = structuredClone(defaults);

function buildControlUI(mode) {
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

  // Fill from draft
  for (let i = 0; i < mode; i++) {
    const nameInp = document.getElementById(`p${i}-name`);
    const userInp = document.getElementById(`p${i}-user`);
    nameInp.value = draft.players[i]?.name ?? "";
    userInp.value = draft.players[i]?.user ?? "";
  }

  // Update draft as you type (no POST)
  modeSel.onchange = () => {
    draft.mode = clamp(Number(modeSel.value), 1, 6);
    buildControlUI(draft.mode); // rebuild only when you change mode
  };

  for (let i = 0; i < mode; i++) {
    const nameInp = document.getElementById(`p${i}-name`);
    const userInp = document.getElementById(`p${i}-user`);

    nameInp.addEventListener("input", () => {
      draft.players[i].name = nameInp.value;
    });

    userInp.addEventListener("input", () => {
      draft.players[i].user = userInp.value;
    });
  }
}

function setStatus(text, ok = true) {
  const btn = document.getElementById("sendBtn");
  if (!btn) return;
  btn.textContent = text;
  btn.disabled = !ok;
  setTimeout(() => {
    btn.textContent = "SEND TO OVERLAY";
    btn.disabled = false;
  }, 900);
}

// -------------------- Overlay poll loop --------------------
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
    // Start your draft from what's currently live
    draft = normalizeState(initial);
    buildControlUI(clamp(draft.mode, 1, 6));

    const sendBtn = document.getElementById("sendBtn");
    const syncBtn = document.getElementById("syncBtn");
    const demoBtn = document.getElementById("fillDemo");
    const resetBtn = document.getElementById("reset");

    if (sendBtn) {
      sendBtn.onclick = async () => {
        try {
          setStatus("SENDING...", false);
          await apiPost(draft);
          setStatus("SENT ✅", true);
        } catch (e) {
          console.warn(e);
          setStatus("FAILED ❌", true);
        }
      };
    }

    if (syncBtn) {
      syncBtn.onclick = async () => {
        try {
          const live = await apiGet();
          draft = normalizeState(live);
          buildControlUI(clamp(draft.mode, 1, 6));
        } catch (e) {
          console.warn(e);
        }
      };
    }

    if (demoBtn) {
      demoBtn.onclick = () => {
        draft.players = draft.players.map((_, idx) => ({
          name: ["MONTANA", "ALEX", "JORDAN", "RILEY", "CASEY", "SKY"][idx] || `PLAYER ${idx + 1}`,
          user: ["ITZDIRT", "ACE", "J0RD", "R1LEY", "C4SEY", "SKYNET"][idx] || `USER${idx + 1}`,
        }));
        buildControlUI(clamp(draft.mode, 1, 6));
      };
    }

    if (resetBtn) {
      resetBtn.onclick = () => {
        draft = structuredClone(defaults);
        buildControlUI(clamp(draft.mode, 1, 6));
      };
    }
  }
})();
