const socket = io({ transports: ["websocket", "polling"] });

let myId = null;
let state = null;
let localDistance = 0;
let localLastInput = null;
let countdownTimer = null;
let previousFallen = false;

const targetDistances = new Map();
const visualDistances = new Map();

const $ = id => document.getElementById(id);
const joinScreen = $("joinScreen");
const gameScreen = $("gameScreen");
const nameInput = $("name");
const joinBtn = $("joinBtn");
const errorEl = $("error");
const playerCount = $("playerCount");
const stateLabel = $("stateLabel");
const streakLabel = $("streakLabel");
const shieldLabel = $("shieldLabel");
const hostLabel = $("hostLabel");
const message = $("message");
const track = $("track");
const leftBtn = $("leftBtn");
const rightBtn = $("rightBtn");
const upBtn = $("upBtn");
const downBtn = $("downBtn");
const nukeBtn = $("nukeBtn");
const targetGrid = $("targetGrid");
const readyBtn = $("readyBtn");
const startBtn = $("startBtn");
const resetBtn = $("resetBtn");
const results = $("results");
const countdown = $("countdown");
const fallBanner = $("fallBanner");

joinBtn.onclick = () => socket.emit("join", nameInput.value);
nameInput.addEventListener("keydown", e => { if (e.key === "Enter") joinBtn.click(); });

readyBtn.onclick = () => socket.emit("toggleReady");
startBtn.onclick = () => socket.emit("startRace");
resetBtn.onclick = () => socket.emit("resetRace");

function me() {
  return state?.players.find(p => p.id === myId);
}

function canAct() {
  const p = me();
  return !!(state && p && state.raceState === "racing" && !p.finished && !p.fallen);
}

function attemptStride(kind) {
  if (!canAct()) return;
  if (kind === localLastInput) return;

  localLastInput = kind;
  localDistance = Math.min(100, localDistance + 0.40);
  targetDistances.set(myId, localDistance);

  flash(kind === "left" ? leftBtn : rightBtn);
  socket.emit("stride", kind);
}

function attemptAttack(direction) {
  if (!canAct()) return;
  const btn = direction === "up" ? upBtn : downBtn;
  flash(btn);
  animateAttack(myId, direction);
  socket.emit("attack", direction);
}

function throwAt(number) {
  if (!canAct()) return;
  const p = me();
  if (p?.lane === number) {
    message.textContent = "You can't throw at yourself.";
    return;
  }
  socket.emit("throwFootballAt", number);
}

function useNuke() {
  const p = me();
  if (!canAct() || !p?.hasNuke) return;
  flash(nukeBtn);
  socket.emit("useNuke");
}

function flash(btn) {
  btn.classList.add("pressed");
  setTimeout(() => btn.classList.remove("pressed"), 90);
}

function animateAttack(id, direction) {
  const runner = track.querySelector(`.lane[data-id="${CSS.escape(id)}"] .runner`);
  if (!runner) return;
  const cls = direction === "up" ? "attacking-up" : "attacking-down";
  runner.classList.add(cls);
  setTimeout(() => runner.classList.remove(cls), 170);
}

leftBtn.addEventListener("pointerdown", e => { e.preventDefault(); attemptStride("left"); });
rightBtn.addEventListener("pointerdown", e => { e.preventDefault(); attemptStride("right"); });
upBtn.addEventListener("pointerdown", e => { e.preventDefault(); attemptAttack("up"); });
downBtn.addEventListener("pointerdown", e => { e.preventDefault(); attemptAttack("down"); });
nukeBtn.addEventListener("pointerdown", e => { e.preventDefault(); useNuke(); });

window.addEventListener("keydown", e => {
  if (e.repeat) return;

  if (e.key === "ArrowLeft") {
    e.preventDefault();
    attemptStride("left");
  } else if (e.key === "ArrowRight") {
    e.preventDefault();
    attemptStride("right");
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    attemptAttack("up");
  } else if (e.key === "ArrowDown") {
    e.preventDefault();
    attemptAttack("down");
  } else if (/^[1-9]$/.test(e.key)) {
    e.preventDefault();
    throwAt(Number(e.key));
  } else if (e.key === "0") {
    e.preventDefault();
    throwAt(10);
  } else if (e.key.toLowerCase() === "n") {
    e.preventDefault();
    useNuke();
  }
});

socket.on("joined", data => {
  myId = data.id;
  joinScreen.classList.add("hidden");
  gameScreen.classList.remove("hidden");
});

socket.on("joinError", msg => errorEl.textContent = msg);
socket.on("message", msg => message.textContent = msg);
socket.on("hostError", msg => message.textContent = msg);

socket.on("strideAck", data => {
  localDistance = data.distance;
  targetDistances.set(myId, data.distance);
});

socket.on("attackQueued", data => {
  animateAttack(myId, data.direction);
});

socket.on("attackMiss", () => {
  message.textContent = "Swing and a miss — nobody close enough in that lane.";
});

socket.on("clash", e => {
  animateAttack(e.playerAId, "up");
  animateAttack(e.playerBId, "down");
  message.textContent = `💥 ${e.playerAName} and ${e.playerBName} collide — neither goes down!`;
});

socket.on("knockdown", e => {
  message.textContent = `💥 ${e.attackerName} knocked down ${e.targetName}!`;

  const runner = track.querySelector(`.lane[data-id="${CSS.escape(e.targetId)}"] .runner`);
  if (runner) runner.classList.add("fallen");

  if (e.targetId === myId) {
    localLastInput = null;
    fallBanner.classList.remove("hidden");
    setTimeout(() => fallBanner.classList.add("hidden"), 900);
  }
});

socket.on("footballThrown", e => {
  animateFootball(e.shooterId, e.targetId, e.travelMs);
});

socket.on("throwCooldown", e => {
  message.textContent = `🏈 Throw recharging: ${(e.remainingMs / 1000).toFixed(1)}s`;
});

socket.on("nukeAwarded", e => {
  if (e.playerId === myId) {
    message.textContent = "☢️ NUKE BALL AWARDED! You're last at halfway — press N.";
    showToast(e.playerId, "☢️ NUKE READY!");
  } else {
    message.textContent = `☢️ ${e.playerName} has the Nuke Ball!`;
  }
});

socket.on("nukeUsed", e => {
  message.textContent = `☢️ ${e.playerName} fired the NUKE BALL — everyone else is stunned for 3 seconds!`;
  if (e.playerId !== myId) {
    localLastInput = null;
    fallBanner.classList.remove("hidden");
    fallBanner.textContent = "☢️ NUKE STUN!";
    setTimeout(() => {
      fallBanner.classList.add("hidden");
      fallBanner.textContent = "💥 YOU'RE DOWN!";
    }, 1200);
  }
});

socket.on("footballMiss", e => {
  if (e.shooterId !== myId) return;
  if (e.reason === "out_of_range") message.textContent = "That runner is outside your 18-yard throwing range.";
  else if (e.reason === "invalid_target") message.textContent = "That runner isn't an available target.";
  else message.textContent = "Pass missed.";
});

socket.on("footballBlocked", e => {
  showToast(e.targetId, `🛡️ BLOCKED · ${e.shieldHitsLeft} LEFT`);
  message.textContent = `${e.targetName}'s blocker intercepted ${e.shooterName}'s football!`;
});

socket.on("footballHit", e => {
  showToast(e.targetId, "🏈 HIT!");
  if (e.targetId === myId) localLastInput = null;
  if (e.earnedShield) {
    showToast(e.shooterId, "🛡️ 3-HIT SHIELD!");
    message.textContent = `${e.shooterName} hit ${e.targetName} 3 times in a row and earned a 3-hit shield!`;
  } else {
    message.textContent = `${e.shooterName} hit ${e.targetName} with a football!`;
  }
});

socket.on("finish", e => {
  if (e.id === myId) message.textContent = `You finished #${e.place}!`;
});

socket.on("go", () => {
  localLastInput = null;
  countdown.textContent = "GO!";
  countdown.classList.remove("hidden");
  setTimeout(() => countdown.classList.add("hidden"), 450);
});

socket.on("state", s => {
  const priorState = state?.raceState;
  state = s;

  for (const p of s.players) {
    if (p.id === myId && s.raceState === "racing") {
      // Correct local prediction downward too (e.g. a knockdown setback).
      if (Math.abs(p.distance - localDistance) > 1.0 || p.fallen) {
        localDistance = p.distance;
      } else if (p.distance > localDistance) {
        localDistance = p.distance;
      }
      targetDistances.set(p.id, localDistance);
    } else {
      targetDistances.set(p.id, p.distance);
    }

    if (!visualDistances.has(p.id)) visualDistances.set(p.id, p.distance);
  }

  if (priorState !== "racing" && s.raceState === "racing") {
    localDistance = s.players.find(p => p.id === myId)?.distance || 0;
    localLastInput = null;
  }

  if (s.raceState === "lobby") {
    localDistance = 0;
    localLastInput = null;
  }

  const mine = me();
  if (mine && previousFallen && !mine.fallen) {
    localLastInput = null;
    message.textContent = "Back on your feet — RUN!";
  }
  previousFallen = !!mine?.fallen;

  renderStatic();
  handleCountdown();
});

function laneFor(id) {
  try { return track.querySelector(`.lane[data-id="${CSS.escape(id)}"]`); } catch { return null; }
}

function runnerFor(id) {
  return laneFor(id)?.querySelector(".runner") || null;
}

function showToast(id, text) {
  const lane = laneFor(id);
  const runner = runnerFor(id);
  if (!lane || !runner) return;
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = text;
  toast.style.left = runner.style.left || "2.5%";
  toast.style.top = "26px";
  lane.appendChild(toast);
  setTimeout(() => toast.remove(), 850);
}

function animateFootball(shooterId, targetId, travelMs) {
  const shooter = runnerFor(shooterId);
  const target = runnerFor(targetId);
  if (!shooter || !target) return;
  const tr = track.getBoundingClientRect();
  const sr = shooter.getBoundingClientRect();
  const rr = target.getBoundingClientRect();
  const ball = document.createElement("div");
  ball.className = "football";
  ball.textContent = "🏈";
  ball.style.left = `${sr.left - tr.left + sr.width/2}px`;
  ball.style.top = `${sr.top - tr.top + sr.height/2}px`;
  ball.style.transitionDuration = `${travelMs}ms`;
  track.appendChild(ball);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    ball.style.left = `${rr.left - tr.left + rr.width/2}px`;
    ball.style.top = `${rr.top - tr.top + rr.height/2}px`;
  }));
  setTimeout(() => ball.remove(), travelMs + 120);
}

function renderStatic() {
  if (!state) return;

  const mine = me();
  const host = state.players.find(p => p.id === state.hostId);
  const isHost = state.hostId === myId;
  const allReady = state.players.length >= 2 && state.players.every(p => p.ready);

  playerCount.textContent = state.players.length;
  stateLabel.textContent =
    state.raceState === "lobby" ? "Lobby" :
    state.raceState === "countdown" ? "Starting…" :
    state.raceState === "racing" ? "Racing" : "Finished";
  hostLabel.textContent = host ? `👑 Host: ${host.name}` : "👑 Host";
  streakLabel.textContent = `🎯 Streak: ${mine?.streakCount || 0}/3`;
  shieldLabel.textContent = `🛡️ Shield: ${mine?.shieldHits || 0}/3`;

  const sorted = [...state.players].sort((a,b) => a.lane-b.lane);
  const existing = new Map([...track.querySelectorAll(".lane")].map(el => [el.dataset.id, el]));
  const ids = new Set(sorted.map(p => p.id));

  for (const [id, el] of existing) if (!ids.has(id)) el.remove();

  sorted.forEach((p, index) => {
    let lane = existing.get(p.id);

    if (!lane) {
      lane = document.createElement("div");
      lane.className = "lane";
      lane.dataset.id = p.id;
      lane.innerHTML = `
        <div class="lane-name"></div>
        <div class="shield"></div>
        <div class="runner">🏃</div>
        <div class="finish"></div>
        <div class="place hidden"></div>`;
      track.appendChild(lane);
    }

    lane.style.order = index;

    lane.querySelector(".lane-name").textContent =
      `${p.lane}. ${p.name}` +
      `${p.id === state.hostId ? " 👑" : ""}` +
      `${p.id === myId ? " (YOU)" : ""}` +
      `${state.raceState === "lobby" ? (p.ready ? " ✓" : " · NOT READY") : ""}` +
      `${p.fallen ? " · DOWN!" : ""}`;

    const runner = lane.querySelector(".runner");
    runner.classList.toggle("fallen", !!p.fallen);
    lane.querySelector(".shield").textContent = p.shieldHits > 0 ? `🛡️${p.shieldHits}` : "";

    const place = lane.querySelector(".place");
    if (p.place) {
      place.textContent = `#${p.place}`;
      place.classList.remove("hidden");
    } else {
      place.classList.add("hidden");
    }
  });

  if (mine) {
    readyBtn.textContent = mine.ready ? "READY ✓" : "I'M READY";
    readyBtn.classList.toggle("on", !!mine.ready);
  }

  readyBtn.classList.toggle("hidden", state.raceState !== "lobby");
  startBtn.classList.toggle("hidden", !(isHost && state.raceState === "lobby"));
  resetBtn.classList.toggle("hidden", !(isHost && state.raceState === "finished"));

  if (isHost && state.raceState === "lobby") {
    startBtn.disabled = !allReady;
    const readyCount = state.players.filter(p => p.ready).length;
    startBtn.textContent = allReady
      ? `START RACE — ${state.players.length} READY`
      : `WAITING — ${readyCount}/${state.players.length} READY`;
  }

  const active = canAct();
  leftBtn.disabled = !active;
  rightBtn.disabled = !active;
  upBtn.disabled = !active;
  downBtn.disabled = !active;
  nukeBtn.disabled = !(active && mine?.hasNuke);
  nukeBtn.textContent = mine?.hasNuke ? "☢️ NUKE READY · N" : "☢️ NUKE BALL · N";
  renderTargets();

  results.innerHTML = state.finishOrder.length
    ? `<h3>🏆 Draft Order</h3>` +
      state.finishOrder.map(r => `
        <div class="result-row">
          <strong>#${r.place}</strong>
          <span>${escapeHtml(r.name)}</span>
        </div>`).join("")
    : "";
}


function renderTargets() {
  if (!state) return;
  const active = canAct();
  targetGrid.innerHTML = "";

  for (let i = 1; i <= 10; i++) {
    const p = state.players.find(x => x.lane === i);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "target-btn";
    btn.textContent = p ? `#${i} ${p.name}` : `#${i} —`;
    btn.title = i === 10 ? "Keyboard: 0" : `Keyboard: ${i}`;

    if (!p || p.id === myId || p.finished || !active) btn.disabled = true;

    btn.addEventListener("pointerdown", e => {
      e.preventDefault();
      throwAt(i);
    });

    targetGrid.appendChild(btn);
  }
}

function handleCountdown() {
  if (!state || state.raceState !== "countdown" || !state.raceStartAt) {
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = null;
    if (state?.raceState !== "racing") countdown.classList.add("hidden");
    return;
  }

  if (countdownTimer) return;

  countdown.classList.remove("hidden");
  countdownTimer = setInterval(() => {
    const ms = state.raceStartAt - Date.now();
    countdown.textContent = Math.max(1, Math.ceil(ms / 1000));
    if (ms <= 0) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }, 80);
}

function animationLoop() {
  if (state) {
    for (const p of state.players) {
      const target = targetDistances.get(p.id) ?? p.distance;
      let visual = visualDistances.get(p.id) ?? target;
      visual += (target - visual) * 0.30;
      if (Math.abs(target - visual) < 0.02) visual = target;
      visualDistances.set(p.id, visual);

      const lane = laneFor(p.id);
      const runner = runnerFor(p.id);
      if (runner) {
        const pct = 2.5 + (Math.min(100, visual) / 100) * 94;
        runner.style.left = `${pct}%`;
        const shield = lane?.querySelector(".shield");
        if (shield) shield.style.left = `${Math.max(2.5, pct - 3)}%`;
      }
    }
  }
  requestAnimationFrame(animationLoop);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

animationLoop();
