import * as THREE from "three";

const CITY_BLOCKS = 12;
const BLOCK = 36;
const ROAD = 14;
const CITY = CITY_BLOCKS * (BLOCK + ROAD);
const HALF = CITY / 2;
const NAMES = [
  "vicekid", "neonlucy", "port_of_call", "sunset8", "pinkslip", "yardbird",
  "tidepool", "calusa", "little_haiti_x", "gold_coast", "bayside", "kilo_run",
  "palmetto", "afterglow", "southpoint", "radio_wave", "key_lime", "marina_99",
];

const state = {
  char: null,
  cash: 2400,
  wanted: 0,
  heat: 0,
  wantedUntil: 0,
  time: 19.4,
  paused: false,
  dead: false,
  inCar: true,
  weapon: "PISTOL",
  mission: null,
  playersOnline: 18 + Math.floor(Math.random() * 7),
  prompt: "",
  feed: [],
};

const keys = Object.create(null);
const mouse = { x: 0, y: 0, down: false, locked: false };
let steerTouch = 0;
let throttleTouch = 0;

const $ = (id) => document.getElementById(id);
const boot = $("boot");
const hud = $("hud");
const cashEl = $("cash");
const starsEl = $("stars");
const wantedLabel = $("wantedLabel");
const clockEl = $("clock");
const sessionEl = $("session");
const promptEl = $("prompt");
const missionEl = $("mission");
const weaponEl = $("weapon");
const killfeedEl = $("killfeed");
const phoneEl = $("phone");
const pauseEl = $("pause");
const bustedEl = $("busted");
const mmap = $("minimap");
const mctx = mmap.getContext("2d");

document.querySelectorAll(".char").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".char").forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
    state.char = btn.dataset.char;
    $("enterBtn").disabled = false;
    $("enterBtn").textContent = `ENTER LEONIDA AS ${state.char.toUpperCase()}`;
  });
});
function enterWorld(char) {
  state.char = char;
  boot.classList.add("hidden");
  hud.classList.remove("hidden");
  if (matchMedia("(pointer: coarse)").matches) $("touch").classList.remove("hidden");
  start();
}

$("enterBtn").addEventListener("click", () => {
  if (!state.char) return;
  enterWorld(state.char);
});

window.addEventListener("error", (e) => {
  const pre = document.createElement("pre");
  pre.style.cssText = "position:fixed;left:8px;top:8px;z-index:99;background:#200;color:#f88;padding:8px;max-width:80vw;white-space:pre-wrap";
  pre.textContent = `${e.message}\n${e.filename}:${e.lineno}`;
  document.body.appendChild(pre);
});
$("resumeBtn").addEventListener("click", () => setPaused(false));
$("respawnBtn").addEventListener("click", respawn);
document.querySelectorAll("#phone button").forEach((b) => {
  b.addEventListener("click", () => startMission(b.dataset.job));
});

window.addEventListener("keydown", (e) => {
  keys[e.code] = true;
  if (e.code === "KeyP") phoneEl.classList.toggle("hidden");
  if (e.code === "Escape") setPaused(!state.paused);
  if (e.code === "KeyM") flash("MAP — minimap is live. Objective is gold.");
  if (e.code === "Digit1") startMission("boost");
  if (e.code === "Digit2") startMission("drop");
  if (e.code === "Digit3") startMission("heat");
  if (e.code === "Digit4") startMission("hit");
});
window.addEventListener("keyup", (e) => { keys[e.code] = false; });
window.addEventListener("mousedown", () => { mouse.down = true; });
window.addEventListener("mouseup", () => { mouse.down = false; });
window.addEventListener("mousemove", (e) => {
  if (mouse.locked || mouse.down) {
    mouse.x += e.movementX * 0.0025;
    mouse.y = THREE.MathUtils.clamp(mouse.y + e.movementY * 0.002, -0.6, 0.55);
  }
});
document.addEventListener("click", () => {
  if (!boot.classList.contains("hidden")) return;
  document.body.requestPointerLock?.();
});
document.addEventListener("pointerlockchange", () => {
  mouse.locked = document.pointerLockElement === document.body;
});

setupTouch();

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x0b0614);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x140820, 0.00115);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.4, 1800);
const clock = new THREE.Clock();

const buildings = [];
const colliders = [];
const traffic = [];
const peds = [];
const bullets = [];
const markers = [];
const cops = [];
const remoteCars = [];

let player, playerCar, sun, hemi, cityRoot, water, radio;
let lastShot = 0;
let lastHonk = 0;
let chaseCam = new THREE.Vector3();
let lookTarget = new THREE.Vector3();

function start() {
  buildWorld();
  spawnPlayer();
  spawnTraffic(14);
  spawnRemotes(8);
  spawnPeds(16);
  startRadio();
  flash("Welcome to Leonida. Phone (P) for work. Don't make it a 5\u2605 night.");
  feed(`${state.char === "lucia" ? "Lucia" : "Jason"} joined session #${1000 + Math.floor(Math.random() * 8000)}`);
  animate();
}

function tex(draw, w = 256, h = 256) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d");
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function buildWorld() {
  cityRoot = new THREE.Group();
  scene.add(cityRoot);
  hemi = new THREE.HemisphereLight(0xffc6e8, 0x0a1420, 0.85);
  scene.add(hemi);
  sun = new THREE.DirectionalLight(0xffd4a8, 1.45);
  sun.position.set(220, 280, 80);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = sun.shadow.camera.bottom = -420;
  sun.shadow.camera.right = sun.shadow.camera.top = 420;
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0x554466, 0.55));
  const groundTex = tex((g, w, h) => {
    g.fillStyle = "#1a1c22";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#2a2d36";
    for (let i = 0; i < 80; i++) g.fillRect(Math.random() * w, Math.random() * h, 8, 3);
    g.strokeStyle = "#3d414c";
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
  });
  groundTex.repeat.set(CITY / 18, CITY / 18);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY + 280, CITY + 280),
    new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.92, color: 0x9aa0aa })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  cityRoot.add(ground);
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY + 200, 180),
    new THREE.MeshStandardMaterial({ color: 0xc9a36a, roughness: 1 })
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.05, HALF + 70);
  cityRoot.add(sand);
  water = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY + 400, 320),
    new THREE.MeshStandardMaterial({ color: 0x0b3d55, roughness: 0.12, metalness: 0.45, emissive: 0x032030, emissiveIntensity: 0.3 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.4, HALF + 240);
  cityRoot.add(water);
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x16181d, roughness: 0.86 });
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xc9b36a });
  for (let i = 0; i <= CITY_BLOCKS; i++) {
    const t = -HALF + i * (BLOCK + ROAD) + ROAD / 2;
    const hRoad = new THREE.Mesh(new THREE.BoxGeometry(CITY + ROAD, 0.12, ROAD), roadMat);
    hRoad.position.set(0, 0.06, t);
    hRoad.receiveShadow = true;
    cityRoot.add(hRoad);
    const vRoad = new THREE.Mesh(new THREE.BoxGeometry(ROAD, 0.12, CITY + ROAD), roadMat);
    vRoad.position.set(t, 0.06, 0);
    vRoad.receiveShadow = true;
    cityRoot.add(vRoad);
    if (i % 2 === 0) {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(CITY, 0.13, 0.35), lineMat);
      dash.position.set(0, 0.12, t);
      cityRoot.add(dash);
    }
  }
  const neon = [0xff2d95, 0x2ee6ff, 0xff6b35, 0xb388ff, 0x5dffb1, 0xffd166];
  for (let gx = 0; gx < CITY_BLOCKS; gx++) {
    for (let gz = 0; gz < CITY_BLOCKS; gz++) {
      const cx = -HALF + ROAD + BLOCK / 2 + gx * (BLOCK + ROAD);
      const cz = -HALF + ROAD + BLOCK / 2 + gz * (BLOCK + ROAD);
      const downtown = Math.hypot(cx, cz) < CITY * 0.22;
      const waterfront = cz > HALF * 0.55;
      const n = downtown && ((gx + gz) % 3 === 0) ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const bw = 8 + ((gx + k * 3) % 10);
        const bd = 8 + ((gz + k * 5) % 10);
        let bh = 10 + ((gx * gz + k * 17) % (downtown ? 70 : waterfront ? 18 : 28));
        if (waterfront) bh = Math.min(bh, 16);
        const ox = ((k * 11) % 7) - 3;
        const oz = ((k * 19) % 7) - 3;
        const col = neon[(gx + gz + k) % neon.length];
        const facade = tex((g, w, h) => {
          g.fillStyle = "#141018";
          g.fillRect(0, 0, w, h);
          const rows = 10, cols = 6;
          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              const lit = Math.random() > 0.35;
              g.fillStyle = lit ? (Math.random() > 0.7 ? "#ff7ad1" : "#ffe3a0") : "#1c1824";
              g.fillRect(10 + c * 38, 8 + r * 24, 22, 14);
            }
          }
          g.fillStyle = `#${col.toString(16).padStart(6, "0")}`;
          g.fillRect(0, h - 18, w, 18);
        }, 256, 256);
        const mat = new THREE.MeshStandardMaterial({
          map: facade, roughness: 0.55, metalness: 0.12,
          emissive: new THREE.Color(col), emissiveIntensity: 0.12,
        });
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), mat);
        mesh.position.set(cx + ox, bh / 2, cz + oz);
        mesh.castShadow = mesh.receiveShadow = true;
        cityRoot.add(mesh);
        buildings.push(mesh);
        colliders.push({
          minX: mesh.position.x - bw / 2 - 0.6,
          maxX: mesh.position.x + bw / 2 + 0.6,
          minZ: mesh.position.z - bd / 2 - 0.6,
          maxZ: mesh.position.z + bd / 2 + 0.6,
          y: bh,
        });
        if (bh > 28 && k === 0 && (gx + gz) % 4 === 0) {
          const sign = new THREE.Mesh(
            new THREE.BoxGeometry(bw * 0.7, 1.4, 0.3),
            new THREE.MeshBasicMaterial({ color: col })
          );
          sign.position.set(mesh.position.x, bh + 1, mesh.position.z + bd / 2 + 0.2);
          cityRoot.add(sign);
        }
      }
    }
  }
  for (let i = 0; i < 40; i++) {
    const px = (Math.random() - 0.5) * CITY;
    const pz = HALF + 20 + Math.random() * 90;
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.5, 6, 6),
      new THREE.MeshStandardMaterial({ color: 0x4a2e1a })
    );
    trunk.position.set(px, 3, pz);
    const leaves = new THREE.Mesh(
      new THREE.ConeGeometry(3.2, 7, 7),
      new THREE.MeshStandardMaterial({ color: 0x1f6b3a })
    );
    leaves.position.set(px, 8.2, pz);
    cityRoot.add(trunk, leaves);
  }
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(900, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0x1a0a24, side: THREE.BackSide })
  );
  scene.add(sky);
}

function carMesh(color, accent = 0x111111) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2.1, 0.55, 4.4),
    new THREE.MeshStandardMaterial({ color, metalness: 0.55, roughness: 0.28 })
  );
  body.position.y = 0.55;
  body.castShadow = true;
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.5, 2.1),
    new THREE.MeshStandardMaterial({ color: 0x11131a, metalness: 0.4, roughness: 0.2 })
  );
  cabin.position.set(0, 1.05, -0.2);
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.15, 0.08, 3.6),
    new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.4 })
  );
  stripe.position.set(0, 0.84, 0);
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.28, 10);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
  const wheels = [];
  [[-0.95, 0.38, 1.35], [0.95, 0.38, 1.35], [-0.95, 0.38, -1.35], [0.95, 0.38, -1.35]].forEach(([x, y, z]) => {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, y, z);
    g.add(w);
    wheels.push(w);
  });
  g.add(body, cabin, stripe);
  g.userData.wheels = wheels;
  return g;
}

function personMesh(primary, hair = 0x1a1210) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.28, 0.9, 4, 8),
    new THREE.MeshStandardMaterial({ color: primary })
  );
  body.position.y = 0.95;
  body.castShadow = true;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 10, 10),
    new THREE.MeshStandardMaterial({ color: 0xe0b089 })
  );
  head.position.y = 1.68;
  const hairM = new THREE.Mesh(
    new THREE.SphereGeometry(0.23, 10, 8, 0, Math.PI * 2, 0, 1.2),
    new THREE.MeshStandardMaterial({ color: hair })
  );
  hairM.position.y = 1.76;
  g.add(body, head, hairM);
  return g;
}

function spawnPlayer() {
  const color = state.char === "lucia" ? 0xff4da6 : 0x2ea4ff;
  player = personMesh(color, state.char === "lucia" ? 0x1a0a08 : 0x3b2a18);
  player.position.set(8, 0, HALF * 0.2);
  scene.add(player);
  playerCar = {
    mesh: carMesh(color, 0xffe08a),
    speed: 0, yaw: 0, x: 10, z: HALF * 0.2 + 6, wantedTarget: false,
  };
  playerCar.mesh.position.set(playerCar.x, 0, playerCar.z);
  scene.add(playerCar.mesh);
  state.inCar = true;
  player.visible = false;
  chaseCam.set(playerCar.x - 12, 7, playerCar.z - 12);
  camera.position.copy(chaseCam);
  camera.lookAt(playerCar.x, 1.2, playerCar.z);
}

function lanePoint() {
  const i = Math.floor(Math.random() * (CITY_BLOCKS + 1));
  const t = -HALF + i * (BLOCK + ROAD) + ROAD / 2;
  if (Math.random() > 0.5) return { x: (Math.random() - 0.5) * CITY, z: t, yaw: Math.random() > 0.5 ? 0 : Math.PI, horiz: true };
  return { x: t, z: (Math.random() - 0.5) * CITY, yaw: Math.random() > 0.5 ? Math.PI / 2 : -Math.PI / 2, horiz: false };
}

function spawnTraffic(n) {
  const colors = [0xc0392b, 0x1f3a5f, 0xf1c40f, 0x27ae60, 0xecf0f1, 0x8e44ad, 0xe67e22];
  for (let i = 0; i < n; i++) {
    const p = lanePoint();
    const car = { mesh: carMesh(colors[i % colors.length]), x: p.x, z: p.z, yaw: p.yaw, speed: 12 + Math.random() * 10, horiz: p.horiz, kind: "npc" };
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.yaw;
    scene.add(car.mesh);
    traffic.push(car);
  }
}

function spawnRemotes(n) {
  for (let i = 0; i < n; i++) {
    const p = lanePoint();
    const car = { mesh: carMesh(0x222222, 0x2ee6ff), x: p.x, z: p.z, yaw: p.yaw, speed: 16 + Math.random() * 8, horiz: p.horiz, kind: "remote", name: NAMES[i % NAMES.length] };
    const tag = makeLabel(car.name);
    tag.position.y = 2.4;
    car.mesh.add(tag);
    car.mesh.position.set(car.x, 0, car.z);
    scene.add(car.mesh);
    remoteCars.push(car);
    traffic.push(car);
  }
}

function makeLabel(text) {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = "rgba(0,0,0,.55)";
  g.fillRect(0, 10, 256, 44);
  g.fillStyle = "#2ee6ff";
  g.font = "28px Rajdhani, sans-serif";
  g.textAlign = "center";
  g.fillText(text, 128, 42);
  const t = new THREE.CanvasTexture(c);
  const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true }));
  m.scale.set(4, 1, 1);
  return m;
}

function spawnPeds(n) {
  for (let i = 0; i < n; i++) {
    const p = lanePoint();
    const side = (Math.random() > 0.5 ? 1 : -1) * (ROAD / 2 + 3);
    const ped = {
      mesh: personMesh(new THREE.Color().setHSL(Math.random(), 0.45, 0.45).getHex()),
      x: p.horiz ? p.x : p.x + side,
      z: p.horiz ? p.z + side : p.z,
      yaw: p.yaw, speed: 1.4 + Math.random(), alive: true,
    };
    ped.mesh.position.set(ped.x, 0, ped.z);
    scene.add(ped.mesh);
    peds.push(ped);
  }
}

function spawnCops(count) {
  while (cops.length < count) {
    const p = playerPos();
    const ang = Math.random() * Math.PI * 2;
    const dist = 55 + Math.random() * 40;
    const car = { mesh: carMesh(0x0d1b2a, 0xff2244), x: p.x + Math.cos(ang) * dist, z: p.z + Math.sin(ang) * dist, yaw: 0, speed: 0, kind: "cop" };
    const light = new THREE.PointLight(0xff2244, 3, 18);
    light.position.set(0, 1.4, 1.6);
    car.mesh.add(light);
    car.light = light;
    car.mesh.position.set(car.x, 0, car.z);
    scene.add(car.mesh);
    cops.push(car);
  }
}

function clearCops() {
  for (const c of cops) scene.remove(c.mesh);
  cops.length = 0;
}

function playerPos() {
  if (state.inCar) return { x: playerCar.x, z: playerCar.z, y: 0 };
  return { x: player.position.x, z: player.position.z, y: 0 };
}

function resolveBuildings(obj, rad = 1.2) {
  for (const b of colliders) {
    const nx = THREE.MathUtils.clamp(obj.x, b.minX, b.maxX);
    const nz = THREE.MathUtils.clamp(obj.z, b.minZ, b.maxZ);
    const dx = obj.x - nx;
    const dz = obj.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < rad * rad) {
      const d = Math.sqrt(d2) || 0.0001;
      obj.x += (dx / d) * (rad - d);
      obj.z += (dz / d) * (rad - d);
      if (obj.speed) obj.speed *= -0.25;
      return true;
    }
  }
  obj.x = THREE.MathUtils.clamp(obj.x, -HALF - 40, HALF + 40);
  obj.z = THREE.MathUtils.clamp(obj.z, -HALF - 40, HALF + 160);
  return false;
}

function bumpWanted(amt, why) {
  state.heat = Math.min(5, state.heat + amt);
  state.wanted = Math.min(5, Math.floor(state.heat + 0.01));
  state.wantedUntil = performance.now() + 18000 + state.wanted * 4000;
  if (why) flash(why);
  if (state.wanted >= 1) spawnCops(Math.min(2 + state.wanted, 6));
}

function decayWanted(dt) {
  if (performance.now() > state.wantedUntil) {
    state.heat = Math.max(0, state.heat - dt * 0.18);
    const next = Math.floor(state.heat + 0.01);
    if (next < state.wanted) {
      state.wanted = next;
      if (state.wanted === 0) {
        clearCops();
        flash("Heat dropped. Streets forgot your face.");
      }
    }
  }
}

function setPaused(v) {
  state.paused = v;
  pauseEl.classList.toggle("hidden", !v);
  if (v) document.exitPointerLock?.();
}

function respawn() {
  state.dead = false;
  bustedEl.classList.add("hidden");
  state.heat = Math.max(0, state.heat - 2);
  state.wanted = Math.floor(state.heat);
  if (state.wanted === 0) clearCops();
  playerCar.x = 10;
  playerCar.z = HALF * 0.2 + 6;
  playerCar.speed = 0;
  playerCar.yaw = 0;
  player.position.set(8, 0, HALF * 0.2);
  state.cash = Math.max(0, state.cash - 400);
  flash("Bailed out. \u2212$400");
}

function nearestVehicle(max = 4.2) {
  const p = playerPos();
  let best = null, bestD = max;
  const list = [playerCar, ...traffic];
  for (const c of list) {
    const d = Math.hypot(c.x - p.x, c.z - p.z);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

function enterExit() {
  if (state.inCar) {
    state.inCar = false;
    player.visible = true;
    player.position.set(playerCar.x + Math.cos(playerCar.yaw) * 2.2, 0, playerCar.z + Math.sin(playerCar.yaw) * 2.2);
    flash("On foot.");
  } else {
    const v = nearestVehicle();
    if (!v) { flash("No ride close enough."); return; }
    if (v !== playerCar) {
      scene.remove(playerCar.mesh);
      playerCar = v;
      if (v.kind === "npc" || v.kind === "remote") {
        bumpWanted(1.2, "Grand theft auto. Heat rising.");
        state.cash += 80;
        if (state.mission?.type === "boost" && v.wantedTarget) completeMission(1800);
      }
    }
    state.inCar = true;
    player.visible = false;
  }
}

let fLatch = false;
function handleEnter() {
  if (keys.KeyF && !fLatch) { enterExit(); fLatch = true; }
  if (!keys.KeyF) fLatch = false;
}

function drive(dt) {
  const car = playerCar;
  const accel = keys.KeyW || keys.ArrowUp || throttleTouch > 0.2 ? 38 : 0;
  const back = keys.KeyS || keys.ArrowDown || throttleTouch < -0.2 ? 22 : 0;
  const steer = ((keys.KeyA || keys.ArrowLeft ? 1 : 0) - (keys.KeyD || keys.ArrowRight ? 1 : 0) + steerTouch);
  const brake = keys.Space || keys.KeyX;
  const boost = keys.ShiftLeft || keys.ShiftRight;
  if (accel) car.speed += accel * dt;
  if (back) car.speed -= back * dt;
  car.speed *= brake ? 0.92 : 0.985;
  if (boost && car.speed > 4) car.speed += 28 * dt;
  car.speed = THREE.MathUtils.clamp(car.speed, -18, boost ? 52 : 36);
  const grip = THREE.MathUtils.clamp(Math.abs(car.speed) / 10, 0.2, 1);
  car.yaw += steer * grip * dt * 1.7 * Math.sign(car.speed || 1);
  const hit = moveCar(car, dt);
  if (hit && Math.abs(car.speed) > 10) bumpWanted(0.15);
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.yaw;
  spinWheels(car, dt);
}

function moveCar(car, dt) {
  car.x += Math.sin(car.yaw) * car.speed * dt;
  car.z += Math.cos(car.yaw) * car.speed * dt;
  const hit = resolveBuildings(car, 2.1);
  for (const other of traffic) {
    if (other === car) continue;
    const d = Math.hypot(other.x - car.x, other.z - car.z);
    if (d < 3.4) {
      const nx = (car.x - other.x) / (d || 1);
      const nz = (car.z - other.z) / (d || 1);
      car.x += nx * 0.4; car.z += nz * 0.4;
      if (car === playerCar && Math.abs(car.speed) > 8) {
        bumpWanted(0.35, "Traffic smash. Cops on the scanner.");
        other.speed *= 0.3;
        if (state.mission?.type === "hit" && other.wantedTarget) {
          other.wantedTarget = false;
          completeMission(2400);
        }
      }
    }
  }
  return hit;
}

function spinWheels(car, dt) {
  for (const w of car.mesh.userData.wheels || []) w.rotation.x += car.speed * dt * 1.6;
}

function walk(dt) {
  const speed = (keys.ShiftLeft ? 9.5 : 5.6);
  let ix = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0) + steerTouch;
  let iz = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0) + throttleTouch;
  const len = Math.hypot(ix, iz) || 1;
  ix /= len; iz /= len;
  const yaw = mouse.x;
  player.position.x += (Math.sin(yaw) * iz + Math.cos(yaw) * ix) * speed * dt;
  player.position.z += (Math.cos(yaw) * iz - Math.sin(yaw) * ix) * speed * dt;
  const dummy = { x: player.position.x, z: player.position.z };
  resolveBuildings(dummy, 0.6);
  player.position.x = dummy.x;
  player.position.z = dummy.z;
  player.rotation.y = yaw;
  if (mouse.down) shoot();
}

function shoot() {
  const now = performance.now();
  if (now - lastShot < 160) return;
  lastShot = now;
  const origin = new THREE.Vector3();
  if (state.inCar) origin.set(playerCar.x, 1.1, playerCar.z);
  else origin.copy(player.position).add(new THREE.Vector3(0, 1.4, 0));
  const yaw = state.inCar ? playerCar.yaw : mouse.x;
  const dir = new THREE.Vector3(Math.sin(yaw), 0.02, Math.cos(yaw));
  const b = {
    mesh: new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffe08a })),
    vel: dir.multiplyScalar(70), life: 1.1,
  };
  b.mesh.position.copy(origin);
  scene.add(b.mesh);
  bullets.push(b);
  bumpWanted(0.08);
}

function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.life -= dt;
    b.mesh.position.addScaledVector(b.vel, dt);
    let hit = false;
    for (const ped of peds) {
      if (!ped.alive) continue;
      if (Math.hypot(ped.x - b.mesh.position.x, ped.z - b.mesh.position.z) < 0.7) {
        ped.alive = false;
        ped.mesh.rotation.x = Math.PI / 2;
        ped.mesh.position.y = 0.3;
        bumpWanted(1.4, "Civilian down. Whole city just heard that.");
        state.cash += 20;
        feed(`${state.char} iced a walker`);
        hit = true;
        break;
      }
    }
    for (const car of traffic) {
      if (Math.hypot(car.x - b.mesh.position.x, car.z - b.mesh.position.z) < 1.8) {
        car.speed *= 0.2;
        if (car.kind === "remote") feed(`${state.char} tagged ${car.name}`);
        if (state.mission?.type === "hit" && car.wantedTarget) completeMission(2400);
        bumpWanted(0.4);
        hit = true;
        break;
      }
    }
    if (hit || b.life <= 0) {
      scene.remove(b.mesh);
      bullets.splice(i, 1);
    }
  }
}

function updateTraffic(dt) {
  for (const car of traffic) {
    if (car === playerCar && state.inCar) continue;
    car.speed += (car.kind === "remote" ? 18 : 14 - car.speed) * dt * 0.4;
    const turn = Math.sin(performance.now() * 0.0004 + car.x) * 0.15 * dt;
    car.yaw += turn;
    moveCar(car, dt);
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.yaw;
    spinWheels(car, dt);
  }
}

function updatePeds(dt) {
  const p = playerPos();
  for (const ped of peds) {
    if (!ped.alive) continue;
    const flee = state.wanted >= 2 && Math.hypot(ped.x - p.x, ped.z - p.z) < 28;
    const yaw = flee ? Math.atan2(ped.x - p.x, ped.z - p.z) : ped.yaw;
    ped.x += Math.sin(yaw) * ped.speed * (flee ? 2.2 : 1) * dt;
    ped.z += Math.cos(yaw) * ped.speed * (flee ? 2.2 : 1) * dt;
    if (Math.abs(ped.x) > HALF + 20) ped.x *= -0.98;
    if (Math.abs(ped.z) > HALF + 20) ped.z *= -0.98;
    ped.mesh.position.set(ped.x, 0, ped.z);
    ped.mesh.rotation.y = yaw;
    if (state.inCar && Math.hypot(ped.x - playerCar.x, ped.z - playerCar.z) < 1.5 && Math.abs(playerCar.speed) > 8) {
      ped.alive = false;
      ped.mesh.rotation.x = Math.PI / 2;
      ped.mesh.position.y = 0.3;
      bumpWanted(1.1, "Hit and run.");
      feed("Witness: 'they didn't even brake'");
    }
  }
}

function updateCops(dt) {
  if (!cops.length) return;
  const p = playerPos();
  for (const c of cops) {
    const ang = Math.atan2(p.x - c.x, p.z - c.z);
    c.yaw = ang;
    c.speed = THREE.MathUtils.lerp(c.speed, 18 + state.wanted * 3, dt * 1.4);
    c.x += Math.sin(c.yaw) * c.speed * dt;
    c.z += Math.cos(c.yaw) * c.speed * dt;
    resolveBuildings(c, 2);
    c.mesh.position.set(c.x, 0, c.z);
    c.mesh.rotation.y = c.yaw;
    if (c.light) c.light.intensity = 2 + Math.sin(performance.now() * 0.02) * 2;
    const d = Math.hypot(c.x - p.x, c.z - p.z);
    if (d < 3.4 && state.wanted >= 2 && !state.dead) {
      state.dead = true;
      $("endTitle").textContent = "BUSTED";
      $("endCopy").textContent = "Leonida PD boxed you in. Bail is $400.";
      bustedEl.classList.remove("hidden");
      document.exitPointerLock?.();
    }
  }
}

function updateCamera(dt) {
  const p = playerPos();
  const yaw = state.inCar ? playerCar.yaw : mouse.x;
  const back = state.inCar ? 12.5 : 6.2;
  const height = state.inCar ? 6.4 : 3.0;
  const aim = state.inCar ? 0 : mouse.y;
  const desired = new THREE.Vector3(p.x - Math.sin(yaw) * back, height + aim * 4, p.z - Math.cos(yaw) * back);
  chaseCam.lerp(desired, 1 - Math.pow(0.001, dt));
  camera.position.copy(chaseCam);
  lookTarget.set(p.x + Math.sin(yaw) * 10, 1.4 - aim * 3, p.z + Math.cos(yaw) * 10);
  camera.lookAt(lookTarget);
}

function startMission(type) {
  phoneEl.classList.add("hidden");
  clearMarkers();
  if (type === "boost") {
    const car = traffic.find((c) => c.kind === "npc") || traffic[0];
    if (!car) return;
    car.wantedTarget = true;
    addMarker(car.mesh, 0xffd166);
    state.mission = { type, title: "STREET BOOST — steal the gold-marked ride" };
  } else if (type === "drop") {
    const z = HALF + 80;
    const x = (Math.random() - 0.5) * 80;
    addWorldMarker(x, z, 0x2ee6ff);
    state.mission = { type, title: "BEACH DROP — take the package to the south sand", x, z };
  } else if (type === "heat") {
    bumpWanted(3.1, "You just painted a target on yourself.");
    state.mission = { type, title: "COOL OFF — survive and drop below 1\u2605", armed: true };
  } else if (type === "hit") {
    const car = remoteCars[Math.floor(Math.random() * remoteCars.length)] || traffic[1];
    if (!car) return;
    car.wantedTarget = true;
    addMarker(car.mesh, 0xff2d95);
    state.mission = { type, title: `SUNSET HIT — wreck ${car.name || "the marked car"}` };
  }
  flash(state.mission.title);
}

function completeMission(pay) {
  state.cash += pay;
  feed(`JOB COMPLETE  +$${pay}`);
  flash(`Job paid $${pay}`);
  state.mission = null;
  clearMarkers();
}

function addMarker(parent, color) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.4, 4), new THREE.MeshBasicMaterial({ color }));
  m.position.y = 3.2;
  m.rotation.x = Math.PI;
  parent.add(m);
  markers.push(m);
  return m;
}

function addWorldMarker(x, z, color) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.2, 20), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7 }));
  m.position.set(x, 0.2, z);
  scene.add(m);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 18, 8), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45 }));
  beam.position.set(x, 9, z);
  scene.add(beam);
  markers.push(m, beam);
  return m;
}

function clearMarkers() {
  for (const m of markers) {
    if (m.parent) m.parent.remove(m);
    scene.remove(m);
  }
  markers.length = 0;
  for (const c of traffic) c.wantedTarget = false;
}

function updateMission() {
  const m = state.mission;
  if (!m) return;
  const p = playerPos();
  if (m.type === "drop" && Math.hypot(p.x - m.x, p.z - m.z) < 6) completeMission(1500);
  if (m.type === "heat" && m.armed && state.wanted === 0) completeMission(2200);
}

function flash(t) {
  state.prompt = t;
  promptEl.textContent = t;
  clearTimeout(flash._t);
  flash._t = setTimeout(() => { if (state.prompt === t) { state.prompt = ""; promptEl.textContent = ""; } }, 3200);
}

function feed(t) {
  state.feed.unshift(t);
  state.feed = state.feed.slice(0, 6);
  killfeedEl.innerHTML = state.feed.map((s) => `<div>${s}</div>`).join("");
}

function drawMinimap() {
  const s = 180;
  mctx.fillStyle = "#0b1a16";
  mctx.fillRect(0, 0, s, s);
  const scale = 180 / (CITY + 200);
  const p = playerPos();
  const to = (x, z) => [s / 2 + (x - p.x) * scale * 3.2, s / 2 + (z - p.z) * scale * 3.2];
  mctx.fillStyle = "#1a2430";
  for (const b of colliders) {
    const [x, y] = to((b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2);
    if (x < -8 || y < -8 || x > 190 || y > 190) continue;
    mctx.fillRect(x - 2, y - 2, 4, 4);
  }
  mctx.fillStyle = "#3d6b5c";
  const [wx, wy] = to(0, HALF + 80);
  mctx.fillRect(wx - 40, wy - 8, 80, 16);
  for (const c of remoteCars) {
    const [x, y] = to(c.x, c.z);
    mctx.fillStyle = "#2ee6ff";
    mctx.fillRect(x - 1.5, y - 1.5, 3, 3);
  }
  for (const c of cops) {
    const [x, y] = to(c.x, c.z);
    mctx.fillStyle = "#ff3355";
    mctx.fillRect(x - 2, y - 2, 4, 4);
  }
  if (state.mission?.x != null) {
    const [x, y] = to(state.mission.x, state.mission.z);
    mctx.fillStyle = "#f5c518";
    mctx.beginPath(); mctx.arc(x, y, 4, 0, Math.PI * 2); mctx.fill();
  }
  mctx.fillStyle = "#ff2d95";
  mctx.beginPath(); mctx.arc(s / 2, s / 2, 4, 0, Math.PI * 2); mctx.fill();
  const yaw = state.inCar ? playerCar.yaw : mouse.x;
  mctx.strokeStyle = "#fff";
  mctx.beginPath();
  mctx.moveTo(s / 2, s / 2);
  mctx.lineTo(s / 2 + Math.sin(yaw) * 10, s / 2 + Math.cos(yaw) * 10);
  mctx.stroke();
}

function updateHud() {
  cashEl.textContent = `$${state.cash.toLocaleString()}`;
  starsEl.textContent = state.wanted ? "\u2605".repeat(state.wanted) : "";
  wantedLabel.textContent = state.wanted ? `${state.wanted} STAR WANTED` : "";
  const h = Math.floor(state.time) % 24;
  const min = Math.floor((state.time % 1) * 60);
  clockEl.textContent = `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  sessionEl.textContent = `LEONIDA \u00b7 ${state.playersOnline} PLAYERS`;
  weaponEl.textContent = state.inCar ? "DRIVE-BY PISTOL" : state.weapon;
  missionEl.textContent = state.mission ? state.mission.title : "P \u00b7 iFruit jobs   F \u00b7 enter vehicle";
  const near = !state.inCar && nearestVehicle();
  if (near && !state.prompt) promptEl.textContent = "F  ENTER VEHICLE";
  else if (state.inCar && !state.prompt) promptEl.textContent = Math.abs(playerCar.speed) < 1.2 ? "F  EXIT VEHICLE" : "";
}

function updateSky(dt) {
  state.time += dt * 0.015;
  const t = (state.time % 24) / 24;
  const night = Math.cos(t * Math.PI * 2) * 0.5 + 0.5;
  sun.intensity = 0.25 + night * 1.1;
  hemi.intensity = 0.25 + night * 0.4;
  const col = new THREE.Color().setHSL(0.72 - night * 0.08, 0.55, 0.06 + night * 0.08);
  scene.fog.color.copy(col);
  renderer.setClearColor(col);
}

function startRadio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  const ctx = new AC();
  const master = ctx.createGain();
  master.gain.value = 0.05;
  master.connect(ctx.destination);
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.value = 110;
  const filt = ctx.createBiquadFilter();
  filt.type = "lowpass";
  filt.frequency.value = 420;
  osc.connect(filt).connect(master);
  osc.start();
  const kick = ctx.createOscillator();
  kick.frequency.value = 2.2;
  const kg = ctx.createGain();
  kg.gain.value = 40;
  kick.connect(kg).connect(filt.frequency);
  kick.start();
  radio = ctx;
  window.addEventListener("click", () => ctx.resume(), { once: true });
}

function setupTouch() {
  const stick = $("stick");
  let tracking = false;
  const go = (x, y) => {
    const r = stick.getBoundingClientRect();
    const dx = (x - (r.left + r.width / 2)) / 50;
    const dy = (y - (r.top + r.height / 2)) / 50;
    steerTouch = THREE.MathUtils.clamp(-dx, -1, 1);
    throttleTouch = THREE.MathUtils.clamp(-dy, -1, 1);
  };
  stick.addEventListener("pointerdown", (e) => { tracking = true; stick.setPointerCapture(e.pointerId); go(e.clientX, e.clientY); });
  stick.addEventListener("pointermove", (e) => { if (tracking) go(e.clientX, e.clientY); });
  stick.addEventListener("pointerup", () => { tracking = false; steerTouch = 0; throttleTouch = 0; });
  $("btnF").addEventListener("click", enterExit);
  $("btnShoot").addEventListener("pointerdown", () => { mouse.down = true; if (!state.inCar) shoot(); });
  $("btnShoot").addEventListener("pointerup", () => { mouse.down = false; });
  $("btnBoost").addEventListener("pointerdown", () => { keys.ShiftLeft = true; });
  $("btnBoost").addEventListener("pointerup", () => { keys.ShiftLeft = false; });
  $("btnBrake").addEventListener("pointerdown", () => { keys.Space = true; });
  $("btnBrake").addEventListener("pointerup", () => { keys.Space = false; });
}

window.addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

let lastFps = performance.now();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (performance.now() - lastFps > 4000) {
    lastFps = performance.now();
    if (Math.random() > 0.6) feed(`${NAMES[Math.floor(Math.random() * NAMES.length)]} robbed a liquor store`);
  }
  if (state.paused || state.dead || boot.classList.contains("hidden") === false) {
    renderer.render(scene, camera);
    return;
  }
  handleEnter();
  if (state.inCar) drive(dt); else walk(dt);
  if (state.inCar && mouse.down) shoot();
  updateTraffic(dt);
  updatePeds(dt);
  updateCops(dt);
  updateBullets(dt);
  updateCamera(dt);
  updateSky(dt);
  decayWanted(dt);
  updateMission();
  drawMinimap();
  updateHud();
  water.position.y = -0.4 + Math.sin(performance.now() * 0.001) * 0.08;
  renderer.render(scene, camera);
}

const bootParams = new URLSearchParams(location.search);
if (bootParams.get("play") === "lucia" || bootParams.get("play") === "jason") {
  enterWorld(bootParams.get("play"));
}
