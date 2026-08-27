const socket = io({ transports:["websocket","polling"] });

let myId = null;
let pendingName = "";
let selectedCharacterId = null;
let characters = [];
let state = null;
let localDistance = 0;
let localLastInput = null;
let countdownTimer = null;
let lastLocalThrowAt = -999999;

const targetDistances = new Map();
const visualDistances = new Map();

const $ = id => document.getElementById(id);

const nameScreen = $("nameScreen");
const characterScreen = $("characterScreen");
const gameScreen = $("gameScreen");
const nameInput = $("nameInput");
const toCharacters = $("toCharacters");
const errorEl = $("error");
const characterGrid = $("characterGrid");
const characterError = $("characterError");
const joinBtn = $("joinBtn");

const playerCount = $("playerCount");
const stateLabel = $("stateLabel");
const streakLabel = $("streakLabel");
const shieldLabel = $("shieldLabel");
const nukeLabel = $("nukeLabel");
const hostLabel = $("hostLabel");
const message = $("message");
const track = $("track");

const leftBtn = $("leftBtn");
const rightBtn = $("rightBtn");
const upBtn = $("upBtn");
const downBtn = $("downBtn");
const jumpBtn = $("jumpBtn");
const forwardBtn = $("forwardBtn");
const nukeBtn = $("nukeBtn");
const readyBtn = $("readyBtn");
const startBtn = $("startBtn");
const resetBtn = $("resetBtn");
const targetGrid = $("targetGrid");
const results = $("results");
const countdown = $("countdown");
const reloadDial = $("reloadDial");
const reloadText = $("reloadText");

toCharacters.onclick = () => {
  pendingName = nameInput.value.trim();
  if (!pendingName) {
    errorEl.textContent = "Enter a name first.";
    return;
  }
  errorEl.textContent = "";
  nameScreen.classList.add("hidden");
  characterScreen.classList.remove("hidden");
  socket.emit("requestCharacters");
};

nameInput.addEventListener("keydown",e=>{
  if(e.key==="Enter") toCharacters.click();
});

joinBtn.onclick = () => {
  if (!selectedCharacterId) return;
  socket.emit("join",{
    name:pendingName,
    characterId:selectedCharacterId
  });
};

readyBtn.onclick = ()=>socket.emit("toggleReady");
startBtn.onclick = ()=>socket.emit("startRace");
resetBtn.onclick = ()=>socket.emit("resetRace");

function me(){
  return state?.players.find(p=>p.id===myId);
}

function canAct(){
  const p = me();
  return state?.raceState==="racing" && p && !p.isFallen && !p.finished;
}

function characterFor(id){
  return characters.find(c=>c.id===id);
}

function renderCharacters(){
  characterGrid.innerHTML = "";

  for (const c of characters) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "character-card";
    btn.disabled = c.taken && c.id!==selectedCharacterId;

    if (c.id===selectedCharacterId) btn.classList.add("selected");

    btn.innerHTML = `
      <div class="pixel-dude" style="--jersey:${c.jersey};--skin:${c.skin}">
        <div class="head"></div>
        <div class="body"></div>
        <div class="letter">${escapeHtml(c.icon)}</div>
        <div class="legs"></div>
      </div>
      <div class="character-name">${escapeHtml(c.name)}</div>
      <div class="note">${c.taken ? "TAKEN" : "AVAILABLE"}</div>
    `;

    btn.addEventListener("click",()=>{
      if (c.taken) return;
      selectedCharacterId = c.id;
      characterError.textContent = "";
      joinBtn.disabled = false;
      renderCharacters();
    });

    characterGrid.appendChild(btn);
  }
}

socket.on("characterState",data=>{
  characters = data.characters || [];
  if (selectedCharacterId) {
    const selected = characters.find(c=>c.id===selectedCharacterId);
    if (selected?.taken && !playersContainsMyCharacter()) {
      selectedCharacterId = null;
      joinBtn.disabled = true;
    }
  }
  renderCharacters();
});

function playersContainsMyCharacter(){
  return !!state?.players.find(p=>p.id===myId && p.characterId===selectedCharacterId);
}

socket.on("joined",data=>{
  myId = data.id;
  characterScreen.classList.add("hidden");
  gameScreen.classList.remove("hidden");
});

socket.on("joinError",msg=>{
  characterError.textContent = msg;
  socket.emit("requestCharacters");
});

socket.on("message",msg=>message.textContent=msg);
socket.on("hostError",msg=>message.textContent=msg);

function stride(kind){
  if (!canAct()) return;
  if (localLastInput===kind) return;
  localLastInput = kind;
  localDistance = Math.min(100,localDistance+.40);
  targetDistances.set(myId,localDistance);
  socket.emit("stride",kind);
}

function attack(dir){
  if (!canAct()) return;
  socket.emit("attack",dir);
}

function jump(){
  if (!canAct()) return;
  socket.emit("jump");
}

function throwAt(n){
  if (!canAct()) return;
  if (me()?.lane===n) {
    message.textContent = "Can't target yourself.";
    return;
  }
  socket.emit("throwFootballAt",n);
}

function throwForward(){
  if (!canAct()) return;
  socket.emit("throwForward");
}

function useNuke(){
  const p = me();
  if (!canAct() || !p?.hasNuke) return;
  socket.emit("useNuke");
}

leftBtn.onpointerdown=e=>{e.preventDefault();stride("left")};
rightBtn.onpointerdown=e=>{e.preventDefault();stride("right")};
upBtn.onpointerdown=e=>{e.preventDefault();attack("up")};
downBtn.onpointerdown=e=>{e.preventDefault();attack("down")};
jumpBtn.onpointerdown=e=>{e.preventDefault();jump()};
forwardBtn.onpointerdown=e=>{e.preventDefault();throwForward()};
nukeBtn.onpointerdown=e=>{e.preventDefault();useNuke()};

window.addEventListener("keydown",e=>{
  if (e.repeat) return;
  if (["INPUT","TEXTAREA"].includes(document.activeElement?.tagName)) return;

  if (e.key==="ArrowLeft"){e.preventDefault();stride("left")}
  else if(e.key==="ArrowRight"){e.preventDefault();stride("right")}
  else if(e.key==="ArrowUp"){e.preventDefault();attack("up")}
  else if(e.key==="ArrowDown"){e.preventDefault();attack("down")}
  else if(e.code==="Space"){e.preventDefault();jump()}
  else if(e.key.toLowerCase()==="f"){e.preventDefault();throwForward()}
  else if(e.key.toLowerCase()==="n"){e.preventDefault();useNuke()}
  else if(/^[1-9]$/.test(e.key)){e.preventDefault();throwAt(Number(e.key))}
  else if(e.key==="0"){e.preventDefault();throwAt(10)}
});

socket.on("strideAck",data=>{
  localDistance = data.distance;
  targetDistances.set(myId,data.distance);
});

socket.on("throwCooldown",data=>{
  message.textContent = `ARM RELOADING — ${(data.remainingMs/1000).toFixed(1)}s`;
});

socket.on("attackMiss",data=>{
  if(data.reason==="out_of_range") message.textContent="Too far away to body-check.";
  else if(data.reason==="no_runner") message.textContent="Nobody in that adjacent lane.";
});

socket.on("knockdown",e=>{
  showToast(e.targetId,"DOWN!");
  message.textContent = `${e.attackerName} flattened ${e.targetName}.`;
  if(e.targetId===myId) localLastInput=null;
});

socket.on("clash",e=>{
  showToast(e.a,"CLASH!");
  showToast(e.b,"CLASH!");
  message.textContent = `${e.aName} and ${e.bName} collide — nobody drops.`;
});

socket.on("footballThrown",e=>{
  lastLocalThrowAt = e.shooterId===myId ? Date.now() : lastLocalThrowAt;
  animateBall(e.shooterId,e.targetId,e.travelMs,false);
});

socket.on("footballMiss",e=>{
  if(e.shooterId!==myId) return;
  if(e.reason==="out_of_range") message.textContent="Target is outside 30-yard range.";
  else message.textContent="Pass missed.";
});

socket.on("footballBlocked",e=>{
  showToast(e.targetId,`SHIELD ${e.shieldHitsLeft}`);
  message.textContent = `${e.targetName}'s shield ate the pass.`;
});

socket.on("footballHit",e=>{
  showToast(e.targetId,"HIT!");
  if(e.targetId===myId) localLastInput=null;
  if(e.earnedShield) {
    showToast(e.shooterId,"SHIELD!");
    message.textContent=`${e.shooterName} earned a 3-hit shield.`;
  } else {
    message.textContent=`${e.shooterName} drilled ${e.targetName}.`;
  }
});

socket.on("forwardThrown",e=>{
  lastLocalThrowAt = e.playerId===myId ? Date.now() : lastLocalThrowAt;
  animateForwardBall(e.playerId,e.start,e.end,e.travelMs);
});

socket.on("forwardMiss",()=>{
  message.textContent="Defender isn't in forward-throw range.";
});

socket.on("defenderDestroyed",e=>{
  showToast(e.playerId,"DEFENDER DOWN");
  message.textContent=`${e.playerName} cleared the lane defender.`;
});

socket.on("defenderTackle",e=>{
  showToast(e.playerId,"BACK TO START!");
  message.textContent=`DEFENSE! ${e.playerName} got sent back to the goal line.`;
  if(e.playerId===myId){
    localDistance=0;
    localLastInput=null;
    targetDistances.set(myId,0);
  }
});

socket.on("jumped",e=>{
  const r=runnerFor(e.playerId);
  if(r){
    r.classList.add("jumping");
    setTimeout(()=>r.classList.remove("jumping"),900);
  }
});

socket.on("defenseWave",()=>{
  message.textContent="⚠ DEFENSIVE WAVE! Defenders are coming right-to-left in every lane.";
});

socket.on("nukeAwarded",e=>{
  if(e.playerId===myId){
    message.textContent="☢ NUKE BALL UNLOCKED — you're behind midfield. Press N while standing.";
  }
});

socket.on("nukeStarted",e=>{
  message.textContent=`☢ ${e.ownerName} LAUNCHED THE NUKE BALL!`;
  animateNukeChain(e.ownerId,e.victims,e.gapMs);
});

socket.on("nukeBounceHit",e=>{
  showToast(e.victimId,"☢ 10s STUN");
  if(e.victimId===myId) localLastInput=null;
});

socket.on("finish",e=>{
  if(e.id===myId) message.textContent=`FINISH #${e.place}`;
});

socket.on("go",()=>{
  localLastInput=null;
  countdown.textContent="GO!";
  countdown.classList.remove("hidden");
  setTimeout(()=>countdown.classList.add("hidden"),450);
});

socket.on("state",s=>{
  const prev = state?.raceState;
  state = s;

  for(const p of s.players){
    if(p.id===myId && s.raceState==="racing"){
      if(p.distance>localDistance) localDistance=p.distance;
      targetDistances.set(p.id,localDistance);
    }else{
      targetDistances.set(p.id,p.distance);
    }
    if(!visualDistances.has(p.id)) visualDistances.set(p.id,p.distance);
  }

  if(prev!=="racing" && s.raceState==="racing"){
    localDistance=s.players.find(p=>p.id===myId)?.distance||0;
    localLastInput=null;
  }
  if(s.raceState==="lobby"){
    localDistance=0;
    localLastInput=null;
  }

  render();
  handleCountdown();
});

function laneFor(id){
  try{return track.querySelector(`.lane[data-id="${CSS.escape(id)}"]`)}
  catch{return null}
}
function runnerFor(id){return laneFor(id)?.querySelector(".runner-sprite")||null}

function showToast(id,text){
  const lane=laneFor(id);
  const r=runnerFor(id);
  if(!lane||!r)return;
  const t=document.createElement("div");
  t.className="toast";
  t.textContent=text;
  t.style.left=r.style.left||"2.5%";
  t.style.top="28px";
  lane.appendChild(t);
  setTimeout(()=>t.remove(),950);
}

function animateBall(shooterId,targetId,travelMs,nuke){
  const a=runnerFor(shooterId),b=runnerFor(targetId);
  if(!a||!b)return;
  const tr=track.getBoundingClientRect(),ar=a.getBoundingClientRect(),br=b.getBoundingClientRect();
  const ball=document.createElement("div");
  ball.className="football"+(nuke?" nuke-ball":"");
  ball.style.left=`${ar.left-tr.left+ar.width/2}px`;
  ball.style.top=`${ar.top-tr.top+ar.height/2}px`;
  ball.style.transition=`left ${travelMs}ms linear, top ${travelMs}ms linear`;
  track.appendChild(ball);
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    ball.style.left=`${br.left-tr.left+br.width/2}px`;
    ball.style.top=`${br.top-tr.top+br.height/2}px`;
  }));
  setTimeout(()=>ball.remove(),travelMs+120);
}

function animateForwardBall(playerId,start,end,travelMs){
  const lane=laneFor(playerId);
  if(!lane)return;
  const ball=document.createElement("div");
  ball.className="football";
  ball.style.left=`${2.5+(start/100)*94}%`;
  ball.style.top="37px";
  ball.style.transition=`left ${travelMs}ms linear`;
  lane.appendChild(ball);
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    ball.style.left=`${2.5+(end/100)*94}%`;
  }));
  setTimeout(()=>ball.remove(),travelMs+120);
}

function animateNukeChain(ownerId,victims,gapMs){
  if(!victims.length)return;
  const owner=runnerFor(ownerId);
  if(!owner)return;

  const chain=[{id:ownerId},...victims];
  for(let i=0;i<chain.length-1;i++){
    setTimeout(()=>{
      animateBall(chain[i].id,chain[i+1].id,Math.max(260,gapMs),true);
    },i*gapMs);
  }
}

function renderTargets(){
  targetGrid.innerHTML="";
  const active=canAct();
  const mine=me();

  for(let i=1;i<=10;i++){
    const p=state?.players.find(x=>x.lane===i);
    const btn=document.createElement("button");
    btn.type="button";
    btn.className="target-btn";
    btn.textContent=p?`#${i} ${p.name}`:`#${i} —`;
    btn.disabled=!active||!p||p.id===myId||p.finished;
    btn.onpointerdown=e=>{e.preventDefault();throwAt(i)};
    targetGrid.appendChild(btn);
  }
}

function render(){
  if(!state)return;

  const mine=me();
  const host=state.players.find(p=>p.id===state.hostId);
  const isHost=state.hostId===myId;
  const allReady=state.players.length>=2&&state.players.every(p=>p.ready);

  playerCount.textContent=state.players.length;
  stateLabel.textContent=state.raceState.toUpperCase();
  streakLabel.textContent=`🎯 ${mine?.streakCount||0}/3`;
  shieldLabel.textContent=`🛡 ${mine?.shieldHits||0}/3`;
  nukeLabel.textContent=mine?.hasNuke?"☢ NUKE READY":"☢ NO NUKE";
  hostLabel.textContent=host?`HOST: ${host.name}`:"HOST";

  const sorted=[...state.players].sort((a,b)=>a.lane-b.lane);
  const existing=new Map([...track.querySelectorAll(".lane")].map(el=>[el.dataset.id,el]));
  const ids=new Set(sorted.map(p=>p.id));

  for(const [id,el] of existing) if(!ids.has(id)) el.remove();

  for(const p of sorted){
    let lane=existing.get(p.id);
    const c=characterFor(p.characterId)||{jersey:"#fff",accent:"#999"};

    if(!lane){
      lane=document.createElement("div");
      lane.className="lane";
      lane.dataset.id=p.id;
      lane.innerHTML=`
        <div class="lane-label"></div>
        <div class="shield"></div>
        <div class="defender"></div>
        <div class="runner-sprite">
          <div class="helmet"></div>
          <div class="torso"></div>
          <div class="leg1"></div><div class="leg2"></div>
        </div>
      `;
      track.appendChild(lane);
    }

    lane.querySelector(".lane-label").textContent=
      `#${p.lane} ${p.name}${p.id===myId?" [YOU]":""}${state.raceState==="lobby"?(p.ready?" ✓":" NOT READY"):""}`;

    const r=lane.querySelector(".runner-sprite");
    r.style.setProperty("--jersey",c.jersey);
    r.style.setProperty("--accent",c.accent);
    r.classList.toggle("fallen",!!p.isFallen);
    r.classList.toggle("jumping",!!p.isJumping);

    lane.querySelector(".shield").textContent=p.shieldHits?`🛡${p.shieldHits}`:"";

    const d=lane.querySelector(".defender");
    d.style.display=state.defenseActive&&p.defenderAlive?"block":"none";
    d.style.left=`${2.5+(Math.max(0,Math.min(103,p.defenderX))/100)*94}%`;
  }

  if(mine){
    readyBtn.textContent=mine.ready?"READY ✓":"I'M READY";
  }

  readyBtn.classList.toggle("hidden",state.raceState!=="lobby");
  startBtn.classList.toggle("hidden",!(isHost&&state.raceState==="lobby"));
  resetBtn.classList.toggle("hidden",!(isHost&&state.raceState==="finished"));

  if(isHost&&state.raceState==="lobby"){
    const count=state.players.filter(p=>p.ready).length;
    startBtn.disabled=!allReady;
    startBtn.textContent=allReady?`START RACE — ${state.players.length} READY`:`WAITING ${count}/${state.players.length}`;
  }

  const active=canAct();
  leftBtn.disabled=!active;rightBtn.disabled=!active;
  upBtn.disabled=!active;downBtn.disabled=!active;
  jumpBtn.disabled=!active;forwardBtn.disabled=!active;
  nukeBtn.disabled=!(active&&mine?.hasNuke);

  renderTargets();

  results.innerHTML=state.finishOrder.length
    ? `<h3>FINAL DRAFT ORDER</h3>`+state.finishOrder.map(r=>`<div class="result"><strong>#${r.place}</strong><span>${escapeHtml(r.name)}</span></div>`).join("")
    : "";
}

function handleCountdown(){
  if(!state||state.raceState!=="countdown"||!state.raceStartAt){
    if(countdownTimer)clearInterval(countdownTimer);
    countdownTimer=null;
    if(state?.raceState!=="racing")countdown.classList.add("hidden");
    return;
  }
  if(countdownTimer)return;
  countdown.classList.remove("hidden");
  countdownTimer=setInterval(()=>{
    const ms=state.raceStartAt-Date.now();
    countdown.textContent=Math.max(1,Math.ceil(ms/1000));
    if(ms<=0){clearInterval(countdownTimer);countdownTimer=null}
  },80);
}

function animationLoop(){
  if(state){
    for(const p of state.players){
      const target=targetDistances.get(p.id)??p.distance;
      let visual=visualDistances.get(p.id)??target;
      visual+=(target-visual)*.30;
      if(Math.abs(target-visual)<.02)visual=target;
      visualDistances.set(p.id,visual);

      const lane=laneFor(p.id);
      const r=runnerFor(p.id);
      const sh=lane?.querySelector(".shield");
      if(r){
        const pct=2.5+(Math.min(100,visual)/100)*94;
        r.style.left=`${pct}%`;
        if(sh)sh.style.left=`${Math.max(2.5,pct-3)}%`;
      }
    }

    const elapsed=Date.now()-lastLocalThrowAt;
    const cd=state.throwCooldownMs||3000;
    const pct=Math.max(0,Math.min(1,elapsed/cd));
    reloadDial.style.setProperty("--pct",`${pct*100}%`);
    reloadText.innerHTML=pct>=1?"ARM<br>READY":`${Math.ceil((cd-elapsed)/100)/10}s`;
  }
  requestAnimationFrame(animationLoop);
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g,c=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

animationLoop();
