const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { transports: ["websocket", "polling"] });

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 10;
const DISTANCE = 100;

// Race pacing: 250 valid alternating LEFT/RIGHT strides = 100 yards.
// At ~4 valid strides/sec this is about 62.5 seconds without knockdowns.
const STEP_YARDS = 0.40;
const MIN_PRESS_INTERVAL_MS = 55;
const COUNTDOWN_MS = 3200;
const SNAPSHOT_MS = 80;

// Contact rules.
const HIT_RANGE_YARDS = 3.0;       // Must be within 3 yards longitudinally.
const CLASH_WINDOW_MS = 140;       // Opposite attacks inside this window cancel.
const ATTACK_COOLDOWN_MS = 650;    // Prevents attack-key spam.
const FALL_DURATION_MS = 1600;     // Fallen runner cannot stride/attack.
const FALL_SETBACK_YARDS = 1.2;    // Small setback so a hit matters.

app.use(express.static("public"));

let hostId = null;
let raceState = "lobby"; // lobby | countdown | racing | finished
let raceStartAt = null;
let finishOrder = [];
const players = new Map();

// Pending attacks are held briefly so the server can detect a truly simultaneous clash.
const pendingAttacks = new Map();

function cleanName(name) {
  return String(name || "Player").replace(/[<>]/g, "").trim().slice(0, 20) || "Player";
}

function nextLane() {
  const used = new Set([...players.values()].map(p => p.lane));
  for (let i = 1; i <= MAX_PLAYERS; i++) if (!used.has(i)) return i;
  return MAX_PLAYERS;
}

function isFallen(p, now = Date.now()) {
  return p.fallenUntil > now;
}

function payload() {
  const now = Date.now();
  return {
    hostId,
    raceState,
    raceStartAt,
    maxPlayers: MAX_PLAYERS,
    rules: {
      hitRangeYards: HIT_RANGE_YARDS,
      fallDurationMs: FALL_DURATION_MS
    },
    players: [...players.values()].map(p => ({
      id: p.id,
      name: p.name,
      lane: p.lane,
      distance: p.distance,
      ready: p.ready,
      finished: p.finished,
      place: p.place,
      fallenUntil: p.fallenUntil,
      fallen: isFallen(p, now)
    })),
    finishOrder
  };
}

function broadcastState() {
  io.emit("state", payload());
}

function clearPendingAttacks() {
  for (const pending of pendingAttacks.values()) clearTimeout(pending.timer);
  pendingAttacks.clear();
}

function resetRace() {
  clearPendingAttacks();
  raceState = "lobby";
  raceStartAt = null;
  finishOrder = [];

  for (const p of players.values()) {
    p.distance = 0;
    p.ready = false;
    p.finished = false;
    p.place = null;
    p.lastInput = null;
    p.lastPress = 0;
    p.lastAttack = 0;
    p.fallenUntil = 0;
  }

  broadcastState();
}

function fullResetWhenEmpty() {
  clearPendingAttacks();
  hostId = null;
  raceState = "lobby";
  raceStartAt = null;
  finishOrder = [];
}

function adjacentTarget(attacker, direction) {
  const targetLane = direction === "up" ? attacker.lane - 1 : attacker.lane + 1;
  return [...players.values()].find(p =>
    p.lane === targetLane &&
    !p.finished &&
    Math.abs(p.distance - attacker.distance) <= HIT_RANGE_YARDS
  );
}

function oppositeDirection(direction) {
  return direction === "up" ? "down" : "up";
}

function attackKey(attackerId, targetId) {
  return `${attackerId}->${targetId}`;
}

function resolveAttack(attackerId, targetId, direction, createdAt) {
  const key = attackKey(attackerId, targetId);
  const pending = pendingAttacks.get(key);
  if (!pending || pending.createdAt !== createdAt) return;
  pendingAttacks.delete(key);

  if (raceState !== "racing") return;

  const attacker = players.get(attackerId);
  const target = players.get(targetId);
  const now = Date.now();

  if (!attacker || !target || attacker.finished || target.finished) return;
  if (isFallen(attacker, now) || isFallen(target, now)) return;

  const stillAdjacent = Math.abs(attacker.lane - target.lane) === 1;
  const stillInRange = Math.abs(attacker.distance - target.distance) <= HIT_RANGE_YARDS;
  if (!stillAdjacent || !stillInRange) {
    io.to(attackerId).emit("attackMiss", { reason: "out_of_range" });
    return;
  }

  target.distance = Math.max(0, target.distance - FALL_SETBACK_YARDS);
  target.fallenUntil = now + FALL_DURATION_MS;
  target.lastInput = null;

  io.emit("knockdown", {
    attackerId,
    attackerName: attacker.name,
    targetId,
    targetName: target.name,
    fallenUntil: target.fallenUntil
  });

  broadcastState();
}

setInterval(() => {
  if (players.size) broadcastState();
}, SNAPSHOT_MS);

io.on("connection", socket => {
  socket.on("join", rawName => {
    if (players.has(socket.id)) return;

    if (players.size >= MAX_PLAYERS) {
      socket.emit("joinError", "Race is full.");
      return;
    }
    if (raceState !== "lobby") {
      socket.emit("joinError", "The race has already started.");
      return;
    }

    if (!hostId) hostId = socket.id;

    const p = {
      id: socket.id,
      name: cleanName(rawName),
      lane: nextLane(),
      distance: 0,
      ready: false,
      finished: false,
      place: null,
      lastInput: null,
      lastPress: 0,
      lastAttack: 0,
      fallenUntil: 0
    };

    players.set(socket.id, p);
    socket.emit("joined", { id: socket.id });
    io.emit("message", `${p.name} joined.`);
    broadcastState();
  });

  socket.on("toggleReady", () => {
    const p = players.get(socket.id);
    if (!p || raceState !== "lobby") return;
    p.ready = !p.ready;
    broadcastState();
  });

  socket.on("startRace", () => {
    if (socket.id !== hostId || raceState !== "lobby") return;

    if (players.size < 2) {
      socket.emit("hostError", "At least 2 players are required.");
      return;
    }
    if ([...players.values()].some(p => !p.ready)) {
      socket.emit("hostError", "Everyone who joined must be ready.");
      return;
    }

    clearPendingAttacks();
    finishOrder = [];

    for (const p of players.values()) {
      p.distance = 0;
      p.finished = false;
      p.place = null;
      p.lastInput = null;
      p.lastPress = 0;
      p.lastAttack = 0;
      p.fallenUntil = 0;
    }

    raceState = "countdown";
    raceStartAt = Date.now() + COUNTDOWN_MS;
    broadcastState();

    setTimeout(() => {
      if (raceState === "countdown") {
        raceState = "racing";
        io.emit("go", { at: Date.now() });
        broadcastState();
      }
    }, COUNTDOWN_MS);
  });

  socket.on("stride", input => {
    const p = players.get(socket.id);
    const now = Date.now();

    if (!p || raceState !== "racing" || p.finished || isFallen(p, now)) return;

    const kind = input === "left" ? "left" : input === "right" ? "right" : null;
    if (!kind || p.lastInput === kind) return;
    if (now - p.lastPress < MIN_PRESS_INTERVAL_MS) return;

    p.lastInput = kind;
    p.lastPress = now;
    p.distance = Math.min(DISTANCE, p.distance + STEP_YARDS);

    socket.emit("strideAck", { distance: p.distance, input: kind });

    if (p.distance >= DISTANCE && !p.finished) {
      p.finished = true;
      p.place = finishOrder.length + 1;
      finishOrder.push({ id: p.id, name: p.name, place: p.place });

      io.emit("finish", { id: p.id, name: p.name, place: p.place });

      if (finishOrder.length === players.size) {
        raceState = "finished";
        broadcastState();
      }
    }
  });

  socket.on("attack", rawDirection => {
    const attacker = players.get(socket.id);
    const now = Date.now();

    if (!attacker || raceState !== "racing" || attacker.finished || isFallen(attacker, now)) return;

    const direction = rawDirection === "up" ? "up" : rawDirection === "down" ? "down" : null;
    if (!direction) return;

    if (now - attacker.lastAttack < ATTACK_COOLDOWN_MS) return;
    attacker.lastAttack = now;

    const target = adjacentTarget(attacker, direction);

    if (!target) {
      socket.emit("attackMiss", { reason: "no_target" });
      return;
    }

    // If the target has already attacked this runner in the opposite direction
    // and that attack is still in the simultaneous-resolution window, cancel both.
    const reverseKey = attackKey(target.id, attacker.id);
    const reverse = pendingAttacks.get(reverseKey);

    if (
      reverse &&
      reverse.direction === oppositeDirection(direction) &&
      now - reverse.createdAt <= CLASH_WINDOW_MS
    ) {
      clearTimeout(reverse.timer);
      pendingAttacks.delete(reverseKey);

      io.emit("clash", {
        playerAId: attacker.id,
        playerAName: attacker.name,
        playerBId: target.id,
        playerBName: target.name
      });

      return;
    }

    const key = attackKey(attacker.id, target.id);

    // Replace duplicate pending attack, though cooldown normally prevents this.
    const old = pendingAttacks.get(key);
    if (old) clearTimeout(old.timer);

    const createdAt = now;
    const timer = setTimeout(() => {
      resolveAttack(attacker.id, target.id, direction, createdAt);
    }, CLASH_WINDOW_MS);

    pendingAttacks.set(key, {
      attackerId: attacker.id,
      targetId: target.id,
      direction,
      createdAt,
      timer
    });

    socket.emit("attackQueued", { direction, targetId: target.id });
  });

  socket.on("resetRace", () => {
    if (socket.id === hostId) resetRace();
  });

  socket.on("disconnect", () => {
    const p = players.get(socket.id);
    if (p) io.emit("message", `${p.name} left.`);

    // Remove pending attacks involving this socket.
    for (const [key, pending] of pendingAttacks) {
      if (pending.attackerId === socket.id || pending.targetId === socket.id) {
        clearTimeout(pending.timer);
        pendingAttacks.delete(key);
      }
    }

    players.delete(socket.id);

    if (players.size === 0) {
      // Important: closing every browser fully resets the game for the next session.
      fullResetWhenEmpty();
      return;
    }

    if (socket.id === hostId) {
      hostId = [...players.keys()][0];
      const newHost = players.get(hostId);
      io.emit("message", `${newHost.name} is now host.`);
    }

    if (raceState === "racing" && finishOrder.length >= players.size) {
      raceState = "finished";
    }

    broadcastState();
  });
});

server.listen(PORT, () => {
  console.log(`100 Yard Draft Race v3 running on port ${PORT}`);
});
