const KEY = "stasis_player_overlay_v1";
const CHANNEL = "stasis_player_overlay_channel";

const defaults = {
  mode: 5,
  players: Array.from({ length: 6 }, () => ({
    name: "PLAYER NAME",
    user: "USERNAME"
  }))
};

/**
 * Box coordinates detected from your PNGs:
 * 11.png => 1 box
 * 12.png => 2 boxes
 * ...
 * 16.png => 6 boxes
 *
 * Coordinates are {x,y,w,h} in 1920x1080 space.
 */
const BOXES = {
  1: [{ x: 615, y: 281, w: 690, h: 518 }],
  2: [{ x: 185, y: 281, w: 691, h: 518 }, { x: 1036, y: 281, w: 691, h: 518 }],
  3: [{ x: 146, y: 378, w: 433, h: 324 }, { x: 744, y: 378, w: 433, h: 324 }, { x: 1341, y: 378, w: 433, h: 324 }],
  4: [{ x: 304, y: 159, w: 491, h: 368 }, { x: 1124, y: 159, w: 492, h: 368 }, { x: 304, y: 553, w: 491, h: 368 }, { x: 1124, y: 553, w: 492, h: 368 }],
  5: [{ x: 146, y: 159, w: 433, h: 324 }, { x: 744, y: 159, w: 433, h: 324 }, { x: 1341, y: 159, w: 433, h: 324 }, { x: 362, y: 601, w: 433, h: 324 }, { x: 1124, y: 601, w: 433, h: 324 }],
  6: [{ x: 146, y: 159, w: 433, h: 324 }, { x: 744, y: 159, w: 433, h: 324 }, { x: 1341, y: 159, w: 433, h: 324 }, { x: 146, y: 601, w: 433, h: 324 }, { x: 744, y: 601, w: 433, h: 324 }, { x: 1341, y: 601, w: 433, h: 324 }]
};

function loadState(){
  try{
    const raw = localStorage.getItem(KEY);
    if(!raw) return structuredClone(defaults);
    const parsed = JSON.parse(raw);
    // merge safely
    const s = structuredClone(defaults);
    if(parsed && typeof parsed.mode === "number") s.mode = clamp(parsed.mode, 1, 6);
    if(Array.isArray(parsed.players)){
      for(let i=0;i<6;i++){
        if(parsed.players[i]){
          s.players[i].name = String(parsed.players[i].name ?? s.players[i].name);
          s.players[i].user = String(parsed.players[i].user ?? s.players[i].user);
        }
      }
    }
    return s;
  }catch{
    return structuredClone(defaults);
  }
}

function saveState(state){
  localStorage.setItem(KEY, JSON.stringify(state));
}

function clamp(n,min,max){ return Math.max(min, Math.min(max, n)); }

let bc = null;
try { bc = new BroadcastChannel(CHANNEL); } catch { bc = null; }
function broadcast(state){
  if(bc) bc.postMessage({ type:"STATE", state });
}

// ---------- Overlay rendering ----------
function fitTextToWidth(el, maxPx){
  // Start from CSS size and shrink until fits
  let size = parseFloat(getComputedStyle(el).fontSize) || 34;
  el.style.fontSize = size + "px";

  // hard limits (keeps it readable)
  const MIN = 18;
  const MAX = 36;

  size = Math.min(MAX, size);

  for(let i=0;i<40;i++){
    if(el.scrollWidth <= maxPx || size <= MIN) break;
    size -= 1;
    el.style.fontSize = size + "px";
  }
}

function renderOverlay(state){
  const bg = document.getElementById("bg");
  const slots = document.getElementById("slots");
  if(!bg || !slots) return;

  const mode = clamp(state.mode, 1, 6);
  bg.src = `${10 + mode}.png`; // 11.png..16.png

  slots.innerHTML = "";
  const boxes = BOXES[mode];

  boxes.forEach((b, idx) => {
    const p = state.players[idx] || { name:"PLAYER NAME", user:"USERNAME" };
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

    // Fit inside the sliver (account for padding + tiger logo)
    const maxTextWidth = b.w - 26 - 78; // left+right padding from CSS
    fitTextToWidth(line, maxTextWidth);
  });
}

// ---------- Control panel rendering ----------
function renderControl(state){
  const modeSel = document.getElementById("mode");
  const playersWrap = document.getElementById("players");
  if(!modeSel || !playersWrap) return;

  modeSel.value = String(state.mode);

  const mode = clamp(state.mode, 1, 6);
  playersWrap.innerHTML = "";

  for(let i=0;i<mode;i++){
    const p = state.players[i] || { name:"PLAYER NAME", user:"USERNAME" };

    const card = document.createElement("div");
    card.className = "playerCard";

    const h = document.createElement("h3");
    h.textContent = `PLAYER ${i+1}`;
    card.appendChild(h);

    const nameLab = document.createElement("label");
    nameLab.innerHTML = `Player Name<input type="text" value="${escapeHtml(p.name)}" data-i="${i}" data-k="name">`;
    card.appendChild(nameLab);

    const userLab = document.createElement("label");
    userLab.innerHTML = `Username<input type="text" value="${escapeHtml(p.user)}" data-i="${i}" data-k="user">`;
    card.appendChild(userLab);

    playersWrap.appendChild(card);
  }

  playersWrap.querySelectorAll("input").forEach(inp => {
    inp.addEventListener("input", () => {
      const i = Number(inp.dataset.i);
      const k = inp.dataset.k;
      const next = loadState();
      next.mode = mode;
      next.players[i][k] = inp.value;
      saveState(next);
      broadcast(next);
    });
  });

  modeSel.onchange = () => {
    const next = loadState();
    next.mode = clamp(Number(modeSel.value), 1, 6);
    saveState(next);
    broadcast(next);
    renderControl(next);
  };

  const demoBtn = document.getElementById("fillDemo");
  const resetBtn = document.getElementById("reset");

  if(demoBtn){
    demoBtn.onclick = () => {
      const next = loadState();
      next.players = next.players.map((p, idx) => ({
        name: ["MONTANA","ALEX","JORDAN","RILEY","CASEY","SKY"][idx] || `PLAYER ${idx+1}`,
        user: ["ITZDIRT","ACE","J0RD","R1LEY","C4SEY","SKYNET"][idx] || `USER${idx+1}`
      }));
      saveState(next);
      broadcast(next);
      renderControl(next);
    };
  }

  if(resetBtn){
    resetBtn.onclick = () => {
      saveState(structuredClone(defaults));
      broadcast(structuredClone(defaults));
      renderControl(structuredClone(defaults));
    };
  }
}

function escapeHtml(s){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;");
}

// ---------- Boot ----------
const isControl = document.body.classList.contains("control");
let state = loadState();

if(isControl){
  renderControl(state);
} else {
  renderOverlay(state);

  if(bc){
    bc.onmessage = (ev) => {
      if(ev?.data?.type === "STATE" && ev.data.state){
        state = ev.data.state;
        saveState(state);
        renderOverlay(state);
      }
    };
  }

  // Fallback polling (still no server)
  setInterval(() => {
    const next = loadState();
    if(JSON.stringify(next) !== JSON.stringify(state)){
      state = next;
      renderOverlay(state);
    }
  }, 250);
}
