const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { transports: ["websocket", "polling"] });

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 10;
const DISTANCE = 100;

const STEP_YARDS = 0.40;
const MIN_PRESS_INTERVAL_MS = 55;
const COUNTDOWN_MS = 3200;
const SNAPSHOT_MS = 80;

// Player contact
const HIT_RANGE_YARDS = 4.0;
const ATTACK_COOLDOWN_MS = 850;
const CLASH_WINDOW_MS = 140;
const BODY_CHECK_FALL_MS = 2800;

// Targeted footballs
const THROW_RANGE_YARDS = 30.0;
const THROW_COOLDOWN_MS = 3000;
const THROW_TRAVEL_MS = 420;
const BALL_STUMBLE_MS = 650;

// Shield
const SHIELD_HITS = 3;

// Nuke
const NUKE_STUN_MS = 10000;
const NUKE_HIT_GAP_MS = 340;
const NUKE_CHAIN_START_MS = 400;

// Defense wave
const DEFENDER_SPEED_YPS = 1.65;
const DEFENDER_HIT_RANGE = 1.25;
const DEFENDER_RESPAWN_X = 103;
const DEFENDER_RESPAWN_DELAY_MS = 5000;
const JUMP_DURATION_MS = 1800;
const FORWARD_THROW_RANGE = 16;

const CHARACTERS = [
  { id:"shoe", name:"The Shoe", icon:"👟", jersey:"#ff922b", skin:"#ffd8a8", accent:"#7c2d12" },
  { id:"smiley", name:"Smiley Face", icon:"😀", jersey:"#ffd43b", skin:"#ffe066", accent:"#f59f00" },
  { id:"horse", name:"Horse", icon:"🐴", jersey:"#8d5524", skin:"#c68642", accent:"#5c3a21" },
  { id:"snail", name:"Turbo Snail", icon:"🐌", jersey:"#82c91e", skin:"#d8f5a2", accent:"#5c940d" },
  { id:"poop", name:"Pile of Shit", icon:"💩", jersey:"#8b5e3c", skin:"#a47148", accent:"#5c4033" },
  { id:"banana", name:"Loose Banana", icon:"🍌", jersey:"#ffe066", skin:"#ffd43b", accent:"#f08c00" },
  { id:"chicken", name:"Angry Chicken", icon:"🐔", jersey:"#fff3bf", skin:"#fff9db", accent:"#e03131" },
  { id:"alien", name:"Little Alien", icon:"👽", jersey:"#69db7c", skin:"#8ce99a", accent:"#2b8a3e" },
  { id:"ghost", name:"Ghost Guy", icon:"👻", jersey:"#f8f9fa", skin:"#ffffff", accent:"#adb5bd" },
  { id:"hotdog", name:"Hot Dog", icon:"🌭", jersey:"#e8590c", skin:"#ffa94d", accent:"#c92a2a" }
];

app.use(express.static("public"));

let hostId = null;
let raceState = "lobby";
let raceStartAt = null;
let finishOrder = [];
let defenseActive = false;
let defenseTimer = null;

const players = new Map();
const pendingAttacks = new Map();

function cleanName(name) {
  return String(name || "Player").replace(/[<>]/g, "").trim().slice(0, 20) || "Player";
}

function nextLane() {
  const used = new Set([...players.values()].map(p => p.lane));
  for (let i=1;i<=MAX_PLAYERS;i++) if (!used.has(i)) return i;
  return MAX_PLAYERS;
}

function characterById(id) {
  return CHARACTERS.find(c => c.id === id) || null;
}

function characterTaken(id) {
  return [...players.values()].some(p => p.characterId === id);
}

function initRacePlayer(p) {
  p.distance = 0;
  p.finished = false;
  p.place = null;
  p.lastInput = null;
  p.lastPress = 0;
  p.lastAttackAt = 0;
  p.fallenUntil = 0;
  p.lastThrowAt = 0;
  p.streakTargetId = null;
  p.streakCount = 0;
  p.shieldHits = 0;
  p.hasNuke = false;
  p.usedNuke = false;
  p.isJumpingUntil = 0;
  p.defenderX = DEFENDER_RESPAWN_X;
  p.defenderAlive = true;
  p.defenderRespawnAt = 0;
}

function statePayload() {
  const now = Date.now();
  return {
    hostId,
    raceState,
    raceStartAt,
    maxPlayers: MAX_PLAYERS,
    defenseActive,
    throwCooldownMs: THROW_COOLDOWN_MS,
    throwRangeYards: THROW_RANGE_YARDS,
    characters: CHARACTERS.map(c => ({
      ...c,
      taken: characterTaken(c.id)
    })),
    players: [...players.values()].map(p => ({
      id:p.id, name:p.name, lane:p.lane, distance:p.distance, ready:p.ready,
      finished:p.finished, place:p.place,
      isFallen:p.fallenUntil > now, fallenUntil:p.fallenUntil,
      streakTargetId:p.streakTargetId, streakCount:p.streakCount,
      shieldHits:p.shieldHits,
      hasNuke:p.hasNuke, usedNuke:p.usedNuke,
      isJumping:p.isJumpingUntil > now,
      defenderX:p.defenderX, defenderAlive:p.defenderAlive,
      characterId:p.characterId
    })),
    finishOrder
  };
}

function broadcastState(){ io.emit("state", statePayload()); }

function clearPendingAttacks(){
  for (const a of pendingAttacks.values()) clearTimeout(a.timer);
  pendingAttacks.clear();
}

function stopDefenseTimer(){
  if (defenseTimer) clearInterval(defenseTimer);
  defenseTimer = null;
}

function resetRace(){
  clearPendingAttacks();
  stopDefenseTimer();
  defenseActive = false;
  raceState = "lobby";
  raceStartAt = null;
  finishOrder = [];
  for (const p of players.values()) {
    initRacePlayer(p);
    p.ready = false;
  }
  broadcastState();
}

function hardResetEmptyServer(){
  clearPendingAttacks();
  stopDefenseTimer();
  defenseActive = false;
  hostId = null;
  raceState = "lobby";
  raceStartAt = null;
  finishOrder = [];
}

function adjacentTarget(attacker, direction){
  const lane = direction === "up" ? attacker.lane-1 : attacker.lane+1;
  return [...players.values()].find(p => p.lane===lane && !p.finished) || null;
}

function playerByNumber(n){
  return [...players.values()].find(p => p.lane===n) || null;
}

function checkNukeEligibility(){
  if (raceState !== "racing") return;

  const contestants = [...players.values()];
  if (!contestants.length) return;

  const crossed = contestants.filter(p => p.distance >= 50 || p.finished).length;
  const threshold = Math.floor(contestants.length / 2) + 1;

  if (crossed >= threshold) {
    let changed = false;
    for (const p of contestants) {
      if (!p.finished && p.distance < 50 && !p.usedNuke && !p.hasNuke) {
        p.hasNuke = true;
        changed = true;
        io.to(p.id).emit("nukeAwarded", { playerId:p.id, playerName:p.name });
      }
    }
    if (changed) broadcastState();
  }
}

function startDefenseWave(){
  if (defenseActive) return;
  defenseActive = true;

  for (const p of players.values()) {
    p.defenderX = DEFENDER_RESPAWN_X;
    p.defenderAlive = true;
  }

  io.emit("defenseWave", {});
  broadcastState();

  let last = Date.now();
  defenseTimer = setInterval(() => {
    if (raceState !== "racing") return;
    const now = Date.now();
    const dt = Math.min((now-last)/1000, .15);
    last = now;

    for (const p of players.values()) {
      if (p.finished) continue;

      // Once a defender is gone, wait until the prior one has fully cleared
      // before spawning the next defensive player in that lane.
      if (!p.defenderAlive) {
        if (p.defenderRespawnAt && now >= p.defenderRespawnAt) {
          p.defenderX = DEFENDER_RESPAWN_X;
          p.defenderAlive = true;
          p.defenderRespawnAt = 0;
          io.emit("defenderRespawn", { playerId:p.id });
        }
        continue;
      }

      p.defenderX -= DEFENDER_SPEED_YPS * dt;

      // Defender has run completely through the lane.
      if (p.defenderX < -3) {
        p.defenderAlive = false;
        p.defenderRespawnAt = now + DEFENDER_RESPAWN_DELAY_MS;
        continue;
      }

      const contact = Math.abs(p.defenderX - p.distance) <= DEFENDER_HIT_RANGE;

      if (contact) {
        // Jumping on top of the defender squashes him.
        if (p.isJumpingUntil > now) {
          p.defenderAlive = false;
          p.defenderRespawnAt = now + DEFENDER_RESPAWN_DELAY_MS;
          io.emit("defenderSquashed", {
            playerId:p.id,
            playerName:p.name
          });
          continue;
        }

        // Shield completely protects the racer from a defensive-player collision.
        // The kangaroo bounces away, the racer keeps their position, and the shield is consumed.
        if (p.fallenUntil <= now && p.shieldHits > 0) {
          p.shieldHits = 0;
          p.defenderAlive = false;
          p.defenderRespawnAt = now + DEFENDER_RESPAWN_DELAY_MS;

          io.emit("defenderShieldBounce", {
            playerId:p.id,
            playerName:p.name
          });
          continue;
        }

        // Normal contact: defender sends the racer back to the start.
        if (p.fallenUntil <= now) {
          p.distance = 0;
          p.lastInput = null;
          p.fallenUntil = now + 1200;
          p.defenderAlive = false;
          p.defenderRespawnAt = now + DEFENDER_RESPAWN_DELAY_MS;

          io.emit("defenderTackle", {
            playerId:p.id,
            playerName:p.name
          });
        }
      }
    }
  }, 80);
}

function resolveAttack(attackerId){
  const attack = pendingAttacks.get(attackerId);
  if (!attack) return;
  pendingAttacks.delete(attackerId);

  const attacker = players.get(attack.attackerId);
  const target = players.get(attack.targetId);
  const now = Date.now();

  if (!attacker || !target || raceState!=="racing") return;
  if (attacker.finished || target.finished || attacker.fallenUntil>now) return;

  if (Math.abs(attacker.distance-target.distance)>HIT_RANGE_YARDS) {
    io.to(attacker.id).emit("attackMiss",{reason:"out_of_range"});
    return;
  }

  const counter = pendingAttacks.get(target.id);
  if (
    counter &&
    counter.targetId===attacker.id &&
    Math.abs(counter.createdAt-attack.createdAt)<=CLASH_WINDOW_MS
  ) {
    clearTimeout(counter.timer);
    pendingAttacks.delete(target.id);
    io.emit("clash",{a:attacker.id,b:target.id,aName:attacker.name,bName:target.name});
    return;
  }

  target.fallenUntil = now + BODY_CHECK_FALL_MS;
  target.lastInput = null;

  io.emit("knockdown",{
    attackerId:attacker.id, attackerName:attacker.name,
    targetId:target.id, targetName:target.name
  });

  broadcastState();
}

function resolveFootball(shooterId,targetId,throwId){
  const shooter = players.get(shooterId);
  const target = players.get(targetId);
  if (!shooter || !target || raceState!=="racing") return;
  if (shooter.finished || target.finished) return;

  if (Math.abs(shooter.distance-target.distance)>THROW_RANGE_YARDS+3) {
    shooter.streakTargetId = null;
    shooter.streakCount = 0;
    io.emit("footballMiss",{throwId,shooterId,targetId,reason:"moved"});
    broadcastState();
    return;
  }

  if (target.shieldHits>0) {
    target.shieldHits -= 1;
    shooter.streakTargetId = null;
    shooter.streakCount = 0;
    io.emit("footballBlocked",{
      throwId, shooterId, shooterName:shooter.name,
      targetId, targetName:target.name, shieldHitsLeft:target.shieldHits
    });
    broadcastState();
    return;
  }

  if (shooter.streakTargetId===targetId) shooter.streakCount += 1;
  else {
    shooter.streakTargetId = targetId;
    shooter.streakCount = 1;
  }

  target.fallenUntil = Math.max(target.fallenUntil,Date.now()+BALL_STUMBLE_MS);
  target.lastInput = null;

  let earnedShield = false;
  if (shooter.streakCount>=3) {
    shooter.shieldHits = SHIELD_HITS;
    shooter.streakCount = 0;
    shooter.streakTargetId = null;
    earnedShield = true;
  }

  io.emit("footballHit",{
    throwId, shooterId, shooterName:shooter.name,
    targetId, targetName:target.name,
    streakCount:shooter.streakCount,
    earnedShield, shieldHits:shooter.shieldHits
  });

  broadcastState();
}

function useNukeBall(owner){
  const now = Date.now();
  if (
    raceState!=="racing" ||
    !owner.hasNuke ||
    owner.usedNuke ||
    owner.fallenUntil>now ||
    owner.finished
  ) return;

  owner.hasNuke = false;
  owner.usedNuke = true;

  const victims = [...players.values()]
    .filter(p => p.id!==owner.id && !p.finished)
    .sort((a,b) => {
      const da = Math.abs(a.lane-owner.lane);
      const db = Math.abs(b.lane-owner.lane);
      return da-db || a.lane-b.lane;
    });

  io.emit("nukeStarted",{
    ownerId:owner.id,
    ownerName:owner.name,
    victims:victims.map(p=>({id:p.id,name:p.name,lane:p.lane})),
    gapMs:NUKE_HIT_GAP_MS,
    stunMs:NUKE_STUN_MS
  });

  victims.forEach((p,index) => {
    setTimeout(() => {
      const victim = players.get(p.id);
      if (!victim || victim.finished) return;
      victim.fallenUntil = Math.max(victim.fallenUntil,Date.now()+NUKE_STUN_MS);
      victim.lastInput = null;
      io.emit("nukeBounceHit",{
        ownerId:owner.id,
        victimId:victim.id,
        victimName:victim.name,
        index
      });
      broadcastState();
    }, NUKE_CHAIN_START_MS + index*NUKE_HIT_GAP_MS);
  });

  broadcastState();
}

setInterval(()=>{ if(players.size) broadcastState(); },SNAPSHOT_MS);

io.on("connection",socket=>{
  socket.emit("characterState", {
    characters: CHARACTERS.map(c => ({...c,taken:characterTaken(c.id)}))
  });

  socket.on("requestCharacters",()=>{
    socket.emit("characterState", {
      characters: CHARACTERS.map(c => ({...c,taken:characterTaken(c.id)}))
    });
  });

  socket.on("join",payload=>{
    if (players.has(socket.id)) return;
    if (players.size>=MAX_PLAYERS) return socket.emit("joinError","Race is full.");
    if (raceState!=="lobby") return socket.emit("joinError","The race has already started.");

    const characterId = String(payload?.characterId || "");
    const character = characterById(characterId);

    if (!character) return socket.emit("joinError","Choose a character.");
    if (characterTaken(characterId)) {
      socket.emit("joinError","That character was just taken. Pick another.");
      socket.emit("characterState", {
        characters: CHARACTERS.map(c => ({...c,taken:characterTaken(c.id)}))
      });
      return;
    }

    if (!hostId) hostId = socket.id;

    const p = {
      id:socket.id,
      name:cleanName(payload?.name),
      lane:nextLane(),
      ready:false,
      characterId
    };

    initRacePlayer(p);
    players.set(socket.id,p);

    socket.emit("joined",{id:socket.id});
    io.emit("message",`${p.name} joined as #${p.lane} — ${character.name}.`);
    io.emit("characterState", {
      characters: CHARACTERS.map(c => ({...c,taken:characterTaken(c.id)}))
    });
    broadcastState();
  });

  socket.on("toggleReady",()=>{
    const p = players.get(socket.id);
    if (!p || raceState!=="lobby") return;
    p.ready = !p.ready;
    broadcastState();
  });

  socket.on("startRace",()=>{
    if (socket.id!==hostId || raceState!=="lobby") return;
    if (players.size<2) return socket.emit("hostError","At least 2 players are required.");
    if ([...players.values()].some(p=>!p.ready)) return socket.emit("hostError","Everyone who joined must be ready.");

    clearPendingAttacks();
    stopDefenseTimer();
    defenseActive = false;
    finishOrder = [];
    for (const p of players.values()) initRacePlayer(p);

    raceState = "countdown";
    raceStartAt = Date.now()+COUNTDOWN_MS;
    broadcastState();

    setTimeout(()=>{
      if (raceState==="countdown") {
        raceState = "racing";
        io.emit("go",{at:Date.now()});
        broadcastState();
      }
    },COUNTDOWN_MS);
  });

  socket.on("stride",input=>{
    const p = players.get(socket.id);
    if (!p || raceState!=="racing" || p.finished) return;

    const now = Date.now();
    if (p.fallenUntil>now) return;

    const kind = input==="left"?"left":input==="right"?"right":null;
    if (!kind) return;
    if (p.lastInput===kind) return;
    if (now-p.lastPress<MIN_PRESS_INTERVAL_MS) return;

    p.lastInput = kind;
    p.lastPress = now;
    p.distance = Math.min(DISTANCE,p.distance+STEP_YARDS);

    socket.emit("strideAck",{distance:p.distance,input:kind});

    if (!defenseActive && p.distance>=50) startDefenseWave();
    checkNukeEligibility();

    if (p.distance>=DISTANCE && !p.finished) {
      p.finished = true;
      p.place = finishOrder.length+1;
      finishOrder.push({id:p.id,name:p.name,place:p.place});
      io.emit("finish",{id:p.id,name:p.name,place:p.place});

      if (finishOrder.length===players.size) {
        raceState = "finished";
        clearPendingAttacks();
        stopDefenseTimer();
        broadcastState();
      }
    }
  });

  socket.on("attack",direction=>{
    const attacker = players.get(socket.id);
    if (!attacker || raceState!=="racing" || attacker.finished) return;

    const now = Date.now();
    if (attacker.fallenUntil>now) return;
    if (now-attacker.lastAttackAt<ATTACK_COOLDOWN_MS) return;

    const dir = direction==="up"?"up":direction==="down"?"down":null;
    if (!dir) return;

    const target = adjacentTarget(attacker,dir);
    attacker.lastAttackAt = now;

    if (!target) return socket.emit("attackMiss",{reason:"no_runner"});
    if (target.fallenUntil>now) return socket.emit("attackMiss",{reason:"already_down"});
    if (Math.abs(attacker.distance-target.distance)>HIT_RANGE_YARDS) {
      return socket.emit("attackMiss",{reason:"out_of_range"});
    }

    const previous = pendingAttacks.get(attacker.id);
    if (previous) clearTimeout(previous.timer);

    const attack = {
      attackerId:attacker.id,
      targetId:target.id,
      createdAt:now,
      timer:null
    };

    attack.timer = setTimeout(()=>resolveAttack(attacker.id),CLASH_WINDOW_MS);
    pendingAttacks.set(attacker.id,attack);
    socket.emit("attackQueued",{targetId:target.id,direction:dir});
  });

  socket.on("throwFootballAt",targetNumber=>{
    const shooter = players.get(socket.id);
    if (!shooter || raceState!=="racing" || shooter.finished) return;

    const now = Date.now();
    if (shooter.fallenUntil>now) return;

    if (now-shooter.lastThrowAt<THROW_COOLDOWN_MS) {
      return socket.emit("throwCooldown",{
        remainingMs:THROW_COOLDOWN_MS-(now-shooter.lastThrowAt)
      });
    }

    const n = Number(targetNumber);
    if (!Number.isInteger(n) || n<1 || n>10) return;

    const target = playerByNumber(n);
    if (!target || target.id===shooter.id || target.finished) {
      return socket.emit("footballMiss",{shooterId:shooter.id,reason:"invalid_target"});
    }

    if (Math.abs(shooter.distance-target.distance)>THROW_RANGE_YARDS) {
      shooter.streakTargetId = null;
      shooter.streakCount = 0;
      socket.emit("footballMiss",{shooterId:shooter.id,targetId:target.id,reason:"out_of_range"});
      broadcastState();
      return;
    }

    shooter.lastThrowAt = now;
    const throwId = `${shooter.id}-${now}`;

    io.emit("footballThrown",{
      throwId, shooterId:shooter.id, shooterName:shooter.name,
      targetId:target.id, targetName:target.name,
      targetNumber:target.lane, travelMs:THROW_TRAVEL_MS
    });

    setTimeout(()=>resolveFootball(shooter.id,target.id,throwId),THROW_TRAVEL_MS);
  });

  socket.on("throwForward",()=>{
    const p = players.get(socket.id);
    if (!p || raceState!=="racing" || p.finished || !p.defenderAlive) return;

    const now = Date.now();
    if (p.fallenUntil>now) return;

    if (now-p.lastThrowAt<THROW_COOLDOWN_MS) {
      return socket.emit("throwCooldown",{remainingMs:THROW_COOLDOWN_MS-(now-p.lastThrowAt)});
    }

    if (p.defenderX < p.distance || p.defenderX-p.distance > FORWARD_THROW_RANGE) {
      return socket.emit("forwardMiss",{reason:"out_of_range"});
    }

    p.lastThrowAt = now;
    const start = p.distance;
    const end = p.defenderX;

    io.emit("forwardThrown",{
      playerId:p.id, playerName:p.name, start, end, travelMs:THROW_TRAVEL_MS
    });

    setTimeout(()=>{
      if (!players.has(p.id)) return;
      p.defenderAlive = false;
      p.defenderRespawnAt = Date.now() + DEFENDER_RESPAWN_DELAY_MS;
      io.emit("defenderDestroyed",{playerId:p.id,playerName:p.name});

      p.defenderRespawnAt = Date.now() + DEFENDER_RESPAWN_DELAY_MS;
    },THROW_TRAVEL_MS);
  });

  socket.on("jump",()=>{
    const p = players.get(socket.id);
    if (!p || raceState!=="racing" || p.finished) return;
    const now = Date.now();
    if (p.fallenUntil>now || p.isJumpingUntil>now) return;
    p.isJumpingUntil = now + JUMP_DURATION_MS;
    io.emit("jumped",{playerId:p.id});
  });

  socket.on("useNuke",()=>{
    const p = players.get(socket.id);
    if (!p) return;
    useNukeBall(p);
  });

  socket.on("resetRace",()=>{
    if (socket.id===hostId) resetRace();
  });

  socket.on("disconnect",()=>{
    const p = players.get(socket.id);
    if (p) io.emit("message",`${p.name} left.`);

    const attack = pendingAttacks.get(socket.id);
    if (attack) {
      clearTimeout(attack.timer);
      pendingAttacks.delete(socket.id);
    }

    players.delete(socket.id);

    io.emit("characterState", {
      characters: CHARACTERS.map(c => ({...c,taken:characterTaken(c.id)}))
    });

    if (players.size===0) {
      hardResetEmptyServer();
      return;
    }

    if (socket.id===hostId) {
      hostId = [...players.keys()][0];
      const newHost = players.get(hostId);
      io.emit("message",`${newHost.name} is now host.`);
    }

    broadcastState();
  });
});

server.listen(PORT,()=>console.log(`Retro Draft Race v6 running on port ${PORT}`));
