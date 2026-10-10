// 3Dの部屋と机とボード(Three.js)。ローポリ(角ばった少ない面)で作る。
// ゲームのルールは知らない。state を受け取って見た目を合わせるだけ。
import * as THREE from 'three';
import { NODES, EARTH_WINDOWS, RETURN_OFFSET, WINDOW_LENGTH, TRANSIT_TO_MARS, TRANSIT_TO_EARTH, START_YEAR } from './data.js';

export const CRAFT_COLORS = ['#e8553f', '#3f8fe8', '#f2c94c', '#7ed957', '#c36ee0', '#f08a3c', '#4fd1c5', '#f2f2f2'];

// ボードの絵(キャンバス)の上での、マスの位置(ピクセル)
const BW = 2048, BH = 1280;
const NODE_PX = {
  earth: [430, 960], leo: [430, 380], mars_approach: [1350, 470], mars_orbit: [1620, 380],
  mars_surface: [1620, 960], earth_approach: [700, 840],
};
const ARC = {
  mto: [[560, 300], [1024, 40], [1490, 300]],
  eto: [[1490, 1020], [1024, 1250], [560, 1020]],
};
const EARTH_C = [430, 640], MARS_C = [1620, 640];

function flat(color, extra = {}) { return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, metalness: 0.05, ...extra }); }
function mesh(geo, mat, pos, rot) {
  const m = new THREE.Mesh(geo, mat);
  if (pos) m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
const box = (w, h, d, color, pos, rot) => mesh(new THREE.BoxGeometry(w, h, d), typeof color === 'string' || typeof color === 'number' ? flat(color) : color, pos, rot);
function canvasTex(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return { c, g: c.getContext('2d'), t };
}
const HEAD = '"Dela Gothic One", "M PLUS Rounded 1c", sans-serif';
const BODY = '"M PLUS Rounded 1c", sans-serif';
function wrap(g, text, x, y, maxW, lh) {
  const lines = []; let line = '';
  for (const ch of text) {
    if (ch === '\n') { lines.push(line); line = ''; continue; }
    if (g.measureText(line + ch).width > maxW && line) { lines.push(line); line = ch; } else line += ch;
  }
  if (line) lines.push(line);
  lines.forEach((l, i) => g.fillText(l, x, y + i * lh));
  return lines.length;
}

export function createScene(container, handlers) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#cfe3ef');
  scene.fog = new THREE.Fog('#d9cdb4', 6, 16);
  const camera = new THREE.PerspectiveCamera(58, 1, 0.02, 40);
  const camBase = new THREE.Vector3(0, 1.46, 0.52);
  const lookBase = new THREE.Vector3(0, 0.62, -0.5);
  camera.position.copy(camBase);

  // ---------- 光 ----------
  scene.add(new THREE.HemisphereLight('#fff6e6', '#5a4a3a', 1.25));
  const sun = new THREE.DirectionalLight('#fff3dc', 1.6);
  sun.position.set(1.2, 3.2, 1.4); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -1.6, right: 1.6, top: 1.6, bottom: -1.6, near: 0.5, far: 7 });
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  const lamp = new THREE.PointLight('#ffd9a0', 0.8, 2.2); lamp.position.set(-0.95, 1.25, -0.55); scene.add(lamp);

  const pickables = [];
  const pickable = (obj, action, tip) => { obj.traverse(o => { o.userData.action = action; o.userData.tip = tip; }); pickables.push(obj); return obj; };

  // ---------- 部屋 ----------
  const room = new THREE.Group(); scene.add(room);
  const carpet = mesh(new THREE.PlaneGeometry(14, 14), flat('#2d6b70'), [0, 0, -2], [-Math.PI / 2, 0, 0]); room.add(carpet);
  // 天井(タイルと照明パネル)
  const ceilTex = canvasTex(256, 256);
  ceilTex.g.fillStyle = '#e4dccb'; ceilTex.g.fillRect(0, 0, 256, 256);
  ceilTex.g.strokeStyle = '#b5ab96'; ceilTex.g.lineWidth = 6; ceilTex.g.strokeRect(0, 0, 256, 256);
  ceilTex.g.fillStyle = 'rgba(0,0,0,0.05)'; for (let i = 0; i < 300; i++) ceilTex.g.fillRect(Math.random() * 256, Math.random() * 256, 3, 3);
  ceilTex.t.wrapS = ceilTex.t.wrapT = THREE.RepeatWrapping; ceilTex.t.repeat.set(14, 14);
  room.add(mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshLambertMaterial({ map: ceilTex.t }), [0, 2.7, -2], [Math.PI / 2, 0, 0]));
  for (const [x, z] of [[0, -0.5], [-2, -2.5], [2, -2.5], [0, -4.5], [-2, 0.8], [2, 0.8]]) {
    room.add(mesh(new THREE.BoxGeometry(1.0, 0.03, 0.5), new THREE.MeshBasicMaterial({ color: '#fffbea' }), [x, 2.69, z]));
  }
  // 空調の吹き出し口
  room.add(box(0.5, 0.02, 0.5, '#c9c2b2', [-1.6, 2.68, -1.2]));
  // 壁
  const wallMat = flat('#d8c6a4');
  room.add(box(14, 2.7, 0.1, wallMat, [0, 1.35, -6]));
  room.add(box(0.1, 2.7, 14, wallMat, [-4.2, 1.35, -2]));
  // 右の壁には大きな窓(外に発射台が見える)
  room.add(box(0.1, 0.9, 14, wallMat, [4.2, 0.45, -2]));
  room.add(box(0.1, 0.5, 14, wallMat, [4.2, 2.45, -2]));
  room.add(box(0.1, 1.3, 3.6, wallMat, [4.2, 1.55, -7.2]));
  room.add(box(0.1, 1.3, 4.0, wallMat, [4.2, 1.55, 3.0]));
  for (const z of [-5.4, -3.4, -1.4, 0.6]) room.add(box(0.14, 1.3, 0.08, '#8c7a5c', [4.18, 1.55, z]));
  // 窓の外
  const outside = new THREE.Group(); outside.position.set(9, 0, -2); scene.add(outside);
  outside.add(mesh(new THREE.PlaneGeometry(30, 12), new THREE.MeshBasicMaterial({ color: '#9fd0f0', fog: false }), [6, 5, 0], [0, -Math.PI / 2, 0]));
  outside.add(mesh(new THREE.PlaneGeometry(20, 30), flat('#6f9a4a'), [0, -0.01, 0], [-Math.PI / 2, 0, 0]));
  for (let i = 0; i < 26; i++) {
    const tz = -9 + Math.random() * 18, tx = 1 + Math.random() * 4.5, sc = 0.7 + Math.random() * 0.9;
    const tree = new THREE.Group();
    tree.add(mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.5, 5), flat('#5a3d28'), [0, 0.25, 0]));
    tree.add(mesh(new THREE.ConeGeometry(0.45, 1.1, 6), flat('#2f5e3a'), [0, 0.95, 0]));
    tree.add(mesh(new THREE.ConeGeometry(0.33, 0.8, 6), flat('#3a7046'), [0, 1.45, 0]));
    tree.position.set(tx, 0, tz); tree.scale.setScalar(sc); outside.add(tree);
  }
  // 発射台と外のロケット
  const pad = new THREE.Group(); pad.position.set(3.2, 0, 1.2); outside.add(pad);
  pad.add(box(1.6, 0.2, 1.6, '#8d8d86', [0, 0.1, 0]));
  const tower = new THREE.Group(); pad.add(tower);
  for (let y = 0; y < 8; y++) tower.add(box(0.32, 0.36, 0.32, new THREE.MeshStandardMaterial({ color: '#c0442f', wireframe: true }), [-0.55, 0.38 + y * 0.36, 0]));
  tower.add(box(0.04, 2.9, 0.04, '#c0442f', [-0.7, 1.6, -0.15])); tower.add(box(0.04, 2.9, 0.04, '#c0442f', [-0.4, 1.6, 0.15]));
  const bigRocket = new THREE.Group(); pad.add(bigRocket);
  bigRocket.add(mesh(new THREE.CylinderGeometry(0.16, 0.16, 2.2, 8), flat('#f3f0e6'), [0, 1.3, 0]));
  bigRocket.add(mesh(new THREE.ConeGeometry(0.16, 0.5, 8), flat('#d9442f'), [0, 2.65, 0]));
  bigRocket.add(mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.25, 8), flat('#2b2b2b'), [0, 0.7, 0]));
  for (let i = 0; i < 4; i++) { const f = box(0.02, 0.35, 0.25, '#d9442f', [Math.cos(i * Math.PI / 2) * 0.2, 0.4, Math.sin(i * Math.PI / 2) * 0.2]); f.rotation.y = -i * Math.PI / 2; bigRocket.add(f); }
  const smoke = []; const smokeGeo = new THREE.IcosahedronGeometry(0.26, 0); const smokeMat = new THREE.MeshLambertMaterial({ color: '#f4f1ea', transparent: true, opacity: 0.85 });
  // 壁の飾り:ポスター、時計、案内板
  const poster = canvasTex(256, 360);
  { const g = poster.g; const gr = g.createLinearGradient(0, 0, 0, 360); gr.addColorStop(0, '#1d2340'); gr.addColorStop(1, '#a8402a'); g.fillStyle = gr; g.fillRect(0, 0, 256, 360);
    g.fillStyle = '#e8553f'; g.beginPath(); g.arc(128, 150, 70, 0, 7); g.fill(); g.fillStyle = '#c0442f'; g.beginPath(); g.arc(150, 130, 18, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.font = `bold 44px ${HEAD}`; g.textAlign = 'center'; g.fillText('MARS', 128, 290); g.font = `bold 30px ${HEAD}`; g.fillText('OR BUST!', 128, 330); }
  room.add(mesh(new THREE.PlaneGeometry(0.5, 0.7), new THREE.MeshLambertMaterial({ map: poster.t }), [-4.14, 1.5, -1.5], [0, Math.PI / 2, 0]));
  const sign = canvasTex(256, 256);
  { const g = sign.g; g.fillStyle = '#1e2a36'; g.fillRect(0, 0, 256, 256); g.fillStyle = '#eee'; g.font = `bold 40px ${HEAD}`; g.textAlign = 'center'; g.fillText('COFFEE', 128, 80); g.font = `bold 120px ${HEAD}`; g.fillText('→', 128, 200); }
  room.add(mesh(new THREE.PlaneGeometry(0.42, 0.42), new THREE.MeshLambertMaterial({ map: sign.t }), [1.6, 1.95, -5.94]));
  const clock = canvasTex(256, 256);
  room.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 16), [flat('#333'), new THREE.MeshLambertMaterial({ map: clock.t }), flat('#333')], [-1.6, 2.0, -5.93], [Math.PI / 2, 0, 0]));
  function drawClock() {
    const g = clock.g, d = new Date(); g.fillStyle = '#f8f6ef'; g.fillRect(0, 0, 256, 256);
    g.save(); g.translate(128, 128); g.rotate(Math.PI);
    g.strokeStyle = '#222'; g.lineCap = 'round';
    const hand = (a, len, w) => { g.lineWidth = w; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.sin(a) * len, -Math.cos(a) * len); g.stroke(); };
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.fillStyle = '#222'; g.fillRect(Math.sin(a) * 100 - 4, -Math.cos(a) * 100 - 4, 8, 8); }
    hand((d.getHours() % 12 + d.getMinutes() / 60) / 12 * Math.PI * 2, 55, 10);
    hand(d.getMinutes() / 60 * Math.PI * 2, 85, 6);
    g.restore(); clock.t.needsUpdate = true;
  }
  drawClock(); setInterval(drawClock, 30000);
  // 奥の別の机(仕切り)
  const partMat = flat('#b5643a'), trimMat = flat('#6e5a45');
  function cubicle(x, z, rotY, h = 1.55) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY;
    g.add(box(2.2, h, 0.06, partMat, [0, h / 2, 0])); g.add(box(2.22, 0.05, 0.08, trimMat, [0, h, 0]));
    room.add(g); return g;
  }
  cubicle(0, -1.05, 0);                      // 自分の机の正面
  cubicle(-1.15, -0.2, Math.PI / 2);         // 左
  cubicle(1.15, -0.2, Math.PI / 2, 1.2);     // 右(低め。窓が見える)
  for (const [x, z] of [[-2.4, -3.2], [0.2, -3.2], [2.6, -3.4], [-2.4, -4.9], [0.2, -4.9]]) {
    cubicle(x, z, 0, 1.3); cubicle(x - 1.1, z + 0.8, Math.PI / 2, 1.3);
    room.add(box(1.4, 0.05, 0.7, '#9b6b43', [x, 0.74, z + 0.45]));
    room.add(box(0.36, 0.32, 0.34, '#d9cfae', [x - 0.2, 0.92, z + 0.35]));
    room.add(box(0.28, 0.22, 0.02, '#4a7a46', [x - 0.2, 0.94, z + 0.53]));
  }
  // 奥の机にいるロボット同僚(画面の顔)
  const bot = new THREE.Group(); bot.position.set(0.9, 0, -2.6); room.add(bot);
  bot.add(box(0.5, 0.42, 0.42, '#e3dcc3', [0, 1.35, 0]));
  const botFace = canvasTex(128, 96);
  { const g = botFace.g; g.fillStyle = '#9ad13b'; g.fillRect(0, 0, 128, 96); g.fillStyle = '#1b1b1b'; g.beginPath(); g.ellipse(40, 40, 9, 12, 0, 0, 7); g.ellipse(88, 40, 9, 12, 0, 0, 7); g.fill(); g.fillRect(40, 70, 48, 4); }
  bot.add(mesh(new THREE.PlaneGeometry(0.36, 0.28), new THREE.MeshBasicMaterial({ map: botFace.t }), [0, 1.36, 0.215]));
  bot.add(box(0.16, 0.5, 0.16, '#c9c2b2', [0, 0.9, 0]));
  bot.add(box(0.5, 0.06, 0.5, '#555', [0, 0.62, 0]));

  // ---------- 机 ----------
  const DESK_Y = 0.75;
  const desk = new THREE.Group(); scene.add(desk);
  desk.add(box(2.2, 0.05, 1.15, '#9b6b43', [0, DESK_Y - 0.025, -0.38]));
  desk.add(box(2.2, 0.06, 0.04, '#7a5232', [0, DESK_Y - 0.03, 0.2]));
  desk.add(box(0.05, 0.72, 1.1, '#6d6a62', [-1.05, 0.36, -0.38]));
  desk.add(box(0.05, 0.72, 1.1, '#6d6a62', [1.05, 0.36, -0.38]));
  desk.add(box(0.5, 0.6, 1.0, '#8a877e', [0.75, 0.32, -0.42]));
  for (let i = 0; i < 3; i++) desk.add(box(0.46, 0.17, 0.02, '#9e9b91', [0.75, 0.52 - i * 0.19, 0.085]));

  // ---------- ボード(ゲーム盤) ----------
  const BOARD_W = 1.2, BOARD_D = BOARD_W * BH / BW;
  const boardPos = new THREE.Vector3(0, DESK_Y + 0.012, -0.4);
  const boardTex = canvasTex(BW, BH);
  const boardTop = new THREE.MeshLambertMaterial({ map: boardTex.t });
  const boardSide = flat('#1d2238');
  const board = mesh(new THREE.BoxGeometry(BOARD_W, 0.024, BOARD_D), [boardSide, boardSide, boardTop, boardSide, boardSide, boardSide], [boardPos.x, boardPos.y, boardPos.z]);
  scene.add(board);
  pickable(board, 'fleet', 'ボード:宇宙船の一覧');
  const boardY = boardPos.y + 0.012;
  const toWorld = ([px, py], lift = 0) => new THREE.Vector3(boardPos.x + (px / BW - 0.5) * BOARD_W, boardY + lift, boardPos.z + (py / BH - 0.5) * BOARD_D);
  const bez = (a, b, c, t) => [(1 - t) ** 2 * a[0] + 2 * (1 - t) * t * b[0] + t * t * c[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * b[1] + t * t * c[1]];

  // 立体の地球と火星
  const earthGeo = new THREE.IcosahedronGeometry(0.038, 1);
  const earthColors = []; const pos = earthGeo.attributes.position;
  for (let i = 0; i < pos.count; i += 3) {
    const c = new THREE.Color(Math.random() < 0.38 ? '#4f9d4a' : '#2f6fc0'); if (pos.getY(i) > 0.05 || pos.getY(i) < -0.05) c.set('#f2f4f6');
    for (let k = 0; k < 3; k++) earthColors.push(c.r, c.g, c.b);
  }
  earthGeo.setAttribute('color', new THREE.Float32BufferAttribute(earthColors, 3));
  const earth = mesh(earthGeo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8 }));
  earth.position.copy(toWorld(EARTH_C, 0.062)); scene.add(earth);
  const marsGeo = new THREE.IcosahedronGeometry(0.038, 1);
  const marsColors = []; const mp = marsGeo.attributes.position;
  for (let i = 0; i < mp.count; i += 3) { const c = new THREE.Color(['#c4512f', '#a8402a', '#d9734a'][Math.floor(Math.random() * 3)]); for (let k = 0; k < 3; k++) marsColors.push(c.r, c.g, c.b); }
  marsGeo.setAttribute('color', new THREE.Float32BufferAttribute(marsColors, 3));
  const mars = mesh(marsGeo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }));
  mars.position.copy(toWorld(MARS_C, 0.052)); scene.add(mars);
  for (const [p, r] of [[EARTH_C, 0.058], [MARS_C, 0.046]]) {
    const ped = mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.7, 0.015, 8), flat('#2c3150'));
    ped.position.copy(toWorld(p, 0.008)); scene.add(ped);
  }
  pickable(earth, 'hangar', '地球:組み立て工場'); pickable(mars, 'fleet', '火星');

  // 年月のコマ(ボードの上の帯)
  const pawn = new THREE.Group();
  pawn.add(mesh(new THREE.CylinderGeometry(0.006, 0.009, 0.02, 6), flat('#f2f2f2'), [0, 0.01, 0]));
  pawn.add(mesh(new THREE.SphereGeometry(0.007, 6, 4), flat('#f2f2f2'), [0, 0.024, 0]));
  scene.add(pawn);
  const trackX = (m) => 120 + (m + 0.5) * ((BW - 240) / 144);

  // ---------- CRTモニター ----------
  const monitor = new THREE.Group(); monitor.position.set(-0.86, DESK_Y, -0.55); monitor.rotation.y = 0.6; scene.add(monitor);
  const beige = flat('#d9cfae'), beigeDark = flat('#bfb38e');
  monitor.add(box(0.44, 0.36, 0.08, beige, [0, 0.27, 0.16]));
  monitor.add(mesh(new THREE.BoxGeometry(0.36, 0.3, 0.3), beigeDark, [0, 0.27, -0.03]));
  monitor.add(box(0.2, 0.05, 0.2, beige, [0, 0.025, 0]));
  monitor.add(box(0.1, 0.06, 0.1, beige, [0, 0.07, 0]));
  const crt = canvasTex(512, 384);
  const screen = mesh(new THREE.PlaneGeometry(0.36, 0.27), new THREE.MeshBasicMaterial({ map: crt.t }), [0, 0.275, 0.201]);
  monitor.add(screen);
  monitor.add(box(0.03, 0.02, 0.01, '#7ed957', [0.17, 0.12, 0.2]));
  // キーボード
  const kb = new THREE.Group(); kb.position.set(-0.78, DESK_Y, 0.04); kb.rotation.y = 0.7; kb.scale.setScalar(0.85); scene.add(kb);
  kb.add(box(0.42, 0.025, 0.15, beige, [0, 0.012, 0]));
  for (let r = 0; r < 4; r++) for (let k = 0; k < 12; k++) kb.add(box(0.026, 0.012, 0.026, '#efe8d2', [-0.18 + k * 0.032, 0.03, -0.05 + r * 0.033]));
  pickable(monitor, 'rd', 'コンピューター:技術開発');
  pickable(kb, 'rd', 'コンピューター:技術開発');

  // ---------- 指示ボード(壁) ----------
  const ib = new THREE.Group(); ib.position.set(0, 1.42, -1.0); scene.add(ib);
  ib.add(box(1.34, 0.78, 0.06, beige, [0, 0, 0]));
  ib.add(box(1.34, 0.12, 0.08, beigeDark, [0, -0.43, 0.01]));
  for (let i = 0; i < 9; i++) { ib.add(box(0.02, 0.07, 0.02, '#9a8f6d', [-0.62 + i * 0.022, -0.43, 0.05])); ib.add(box(0.02, 0.07, 0.02, '#9a8f6d', [0.45 + i * 0.022, -0.43, 0.05])); }
  const ibTex = canvasTex(1024, 560);
  ib.add(mesh(new THREE.PlaneGeometry(1.2, 0.66), new THREE.MeshBasicMaterial({ map: ibTex.t }), [0, 0.01, 0.032]));
  const ibLabel = canvasTex(512, 64);
  { const g = ibLabel.g; g.fillStyle = '#bfb38e'; g.fillRect(0, 0, 512, 64); g.fillStyle = '#6a5f43'; g.font = `bold 34px ${HEAD}`; g.textAlign = 'center'; g.fillText('MISSION DIRECTOR BOARD', 256, 46); }
  ib.add(mesh(new THREE.PlaneGeometry(0.52, 0.065), new THREE.MeshBasicMaterial({ map: ibLabel.t }), [0, -0.43, 0.052]));
  const lights = [];
  for (const x of [0.36, 0.48]) { const l = mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.035, 10), new THREE.MeshStandardMaterial({ color: '#4caf50', emissive: '#2f8f2f', emissiveIntensity: 0.6, flatShading: true }), [x, 0.41, 0]); ib.add(l); lights.push(l); }
  ib.add(box(0.05, 0.8, 0.05, '#a68d4a', [0.72, -0.2, -0.02]));
  pickable(ib, 'help', '指示ボード:遊び方');

  // ---------- FAX ----------
  const fax = new THREE.Group(); fax.position.set(0.86, DESK_Y, -0.42); fax.rotation.y = -0.6; scene.add(fax);
  fax.add(box(0.3, 0.1, 0.26, beige, [0, 0.05, 0]));
  fax.add(box(0.3, 0.05, 0.12, beigeDark, [0, 0.115, -0.07], [0.35, 0, 0]));
  const faxLabel = canvasTex(256, 64);
  { const g = faxLabel.g; g.fillStyle = '#c8bd98'; g.fillRect(0, 0, 256, 64); g.fillStyle = '#1e5a2a'; g.fillRect(8, 8, 112, 48); g.fillStyle = '#9ef07a'; g.font = `bold 24px ${HEAD}`; g.fillText('FAX', 30, 42); g.fillStyle = '#3a3a3a'; g.font = `bold 22px ${HEAD}`; g.fillText('MASTER 90', 128, 42); }
  fax.add(mesh(new THREE.PlaneGeometry(0.2, 0.05), new THREE.MeshBasicMaterial({ map: faxLabel.t }), [0, 0.06, 0.131]));
  const faxLight = mesh(new THREE.BoxGeometry(0.03, 0.012, 0.02), new THREE.MeshStandardMaterial({ color: '#3a3a3a', emissive: '#000' }), [0.11, 0.104, 0.09]);
  fax.add(faxLight);
  const paperTex = canvasTex(256, 330);
  { const g = paperTex.g; g.fillStyle = '#fbfaf5'; g.fillRect(0, 0, 256, 330); g.fillStyle = '#222'; g.font = `bold 22px ${HEAD}`; g.fillText('BLUEBONNET', 20, 40); g.font = `16px ${BODY}`; g.fillText('AEROSPACE INC.', 20, 62); g.font = `bold 34px ${HEAD}`; g.fillText('MEMO', 20, 120); g.fillStyle = '#aaa'; for (let i = 0; i < 7; i++) g.fillRect(20, 150 + i * 22, 200 - (i % 3) * 30, 8); g.fillStyle = '#c0392b'; g.beginPath(); g.moveTo(128, 300); g.lineTo(108, 270); g.lineTo(148, 270); g.fill(); }
  const paper = mesh(new THREE.PlaneGeometry(0.2, 0.26), new THREE.MeshLambertMaterial({ map: paperTex.t, side: THREE.DoubleSide }), [0, 0.12, -0.06], [-1.2, 0, 0]);
  paper.visible = false; fax.add(paper);
  pickable(fax, 'fax', 'FAX:届いた書類');

  // ---------- 次の月へボタン・カレンダー ----------
  const btn = new THREE.Group(); btn.position.set(0.6, DESK_Y, 0.1); btn.scale.setScalar(0.8); scene.add(btn);
  btn.add(mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.04, 10), flat('#5b5e63'), [0, 0.02, 0]));
  const cap = mesh(new THREE.CylinderGeometry(0.058, 0.062, 0.035, 10), new THREE.MeshStandardMaterial({ color: '#57c24a', emissive: '#1f6b18', emissiveIntensity: 0.4, flatShading: true }), [0, 0.055, 0]);
  btn.add(cap);
  const btnLabel = canvasTex(256, 64);
  { const g = btnLabel.g; g.fillStyle = '#e9e3cf'; g.fillRect(0, 0, 256, 64); g.fillStyle = '#2a2a2a'; g.font = `bold 34px ${HEAD}`; g.textAlign = 'center'; g.fillText('次の月へ', 128, 46); }
  btn.add(mesh(new THREE.PlaneGeometry(0.13, 0.032), new THREE.MeshBasicMaterial({ map: btnLabel.t }), [0, 0.001, 0.105], [-Math.PI / 2, 0, 0]));
  pickable(btn, 'next', '大きなボタン:次の月へ');
  const cal = new THREE.Group(); cal.position.set(0.86, DESK_Y, -0.02); cal.rotation.y = -0.6; cal.scale.setScalar(0.9); scene.add(cal);
  const calTex = canvasTex(256, 200);
  const calGeo = new THREE.BoxGeometry(0.16, 0.12, 0.012);
  const calFace = mesh(calGeo, [flat('#ddd'), flat('#ddd'), flat('#ddd'), flat('#ddd'), new THREE.MeshLambertMaterial({ map: calTex.t }), flat('#ddd')], [0, 0.06, 0], [-0.35, 0, 0]);
  cal.add(calFace); cal.add(box(0.16, 0.012, 0.08, '#444', [0, 0.006, -0.02]));
  pickable(cal, 'log', 'カレンダー:記録');
  function drawCalendar(m) {
    const g = calTex.g; g.fillStyle = '#fbfaf5'; g.fillRect(0, 0, 256, 200);
    g.fillStyle = '#c0392b'; g.fillRect(0, 0, 256, 56);
    g.fillStyle = '#fff'; g.font = `bold 40px ${HEAD}`; g.textAlign = 'center'; g.fillText(String(START_YEAR + Math.floor(m / 12)), 128, 44);
    g.fillStyle = '#222'; g.font = `bold 110px ${HEAD}`; g.fillText(`${(m % 12) + 1}月`, 128, 172);
    calTex.t.needsUpdate = true;
  }

  // ---------- 電話・マグ・マニュアル・ライト ----------
  const phone = new THREE.Group(); phone.position.set(-0.5, DESK_Y, 0.12); phone.scale.setScalar(0.8); phone.rotation.y = 0.3; scene.add(phone);
  phone.add(box(0.16, 0.05, 0.13, '#c0392b', [0, 0.025, 0]));
  phone.add(box(0.2, 0.035, 0.05, '#a93226', [0, 0.07, 0]));
  phone.add(box(0.05, 0.03, 0.06, '#a93226', [-0.08, 0.06, 0])); phone.add(box(0.05, 0.03, 0.06, '#a93226', [0.08, 0.06, 0]));
  phone.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.008, 10), flat('#eee'), [0, 0.052, 0.02]));
  pickable(phone, 'crew', '電話:飛行士の採用');
  const mug = new THREE.Group(); mug.position.set(-0.86, DESK_Y, -0.2); scene.add(mug);
  mug.add(mesh(new THREE.CylinderGeometry(0.035, 0.032, 0.09, 8), flat('#f4f4f4'), [0, 0.045, 0]));
  mug.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.005, 8), flat('#4a2c1a'), [0, 0.085, 0]));
  mug.add(mesh(new THREE.TorusGeometry(0.02, 0.006, 4, 8), flat('#f4f4f4'), [0.04, 0.045, 0], [0, 0, Math.PI / 2]));



  // ---------- 宇宙船のコマ ----------
  const pieces = new Map();   // craft.id -> { group, target, color }
  function makePiece(craft) {
    const color = CRAFT_COLORS[craft.color % CRAFT_COLORS.length];
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.04, 6), flat('#f3f0e6'), [0, 0.024, 0]));
    g.add(mesh(new THREE.ConeGeometry(0.009, 0.022, 6), flat(color), [0, 0.055, 0]));
    g.add(mesh(new THREE.CylinderGeometry(0.0115, 0.0115, 0.008, 6), flat(color), [0, 0.012, 0]));
    for (let i = 0; i < 3; i++) { const f = box(0.002, 0.014, 0.01, color, [Math.cos(i * 2.1) * 0.012, 0.009, Math.sin(i * 2.1) * 0.012]); f.rotation.y = -i * 2.1; g.add(f); }
    const tag = canvasTex(64, 64);
    tag.g.fillStyle = color; tag.g.beginPath(); tag.g.arc(32, 32, 30, 0, 7); tag.g.fill();
    tag.g.fillStyle = '#111'; tag.g.font = `bold 38px ${HEAD}`; tag.g.textAlign = 'center'; tag.g.fillText(String(craft.no), 32, 46);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tag.t, depthTest: false })); sp.scale.set(0.022, 0.022, 1); sp.position.y = 0.085; sp.renderOrder = 5;
    g.add(sp);
    pickable(g, `craft:${craft.id}`, craft.name);
    scene.add(g);
    return { group: g, target: new THREE.Vector3(), color, spawned: performance.now() };
  }
  function craftPx(s, craft, idx, count) {
    let base;
    if (craft.loc === 'mto' || craft.loc === 'eto') {
      const dur = craft.loc === 'mto' ? TRANSIT_TO_MARS : TRANSIT_TO_EARTH;
      const t = Math.min(0.95, Math.max(0.05, 1 - (craft.arrive - s.month) / dur));
      const [a, b, c] = ARC[craft.loc]; base = bez(a, b, c, t);
    } else base = NODE_PX[craft.loc] || NODE_PX.earth;
    const off = (idx - (count - 1) / 2) * 52;
    return [base[0] + off, base[1]];
  }

  // ---------- ボードの絵を描く ----------
  const stars = Array.from({ length: 260 }, () => [Math.random() * BW, Math.random() * BH, Math.random() * 2.2 + 0.4]);
  function drawBoard(s) {
    const g = boardTex.g;
    const gr = g.createLinearGradient(0, 0, BW, BH); gr.addColorStop(0, '#141a33'); gr.addColorStop(1, '#22163a');
    g.fillStyle = gr; g.fillRect(0, 0, BW, BH);
    for (const [x, y, r] of stars) { g.fillStyle = `rgba(255,255,255,${0.25 + r / 4})`; g.fillRect(x, y, r, r); }
    g.strokeStyle = '#d9cfae'; g.lineWidth = 14; g.strokeRect(7, 7, BW - 14, BH - 14);
    // 年月の帯
    const tw = (BW - 240) / 144;
    for (let m = 0; m < 144; m++) {
      const x = 120 + m * tw;
      const ew = EARTH_WINDOWS.some(w => m >= w && m < w + WINDOW_LENGTH), mw = EARTH_WINDOWS.some(w => m >= w + RETURN_OFFSET && m < w + RETURN_OFFSET + WINDOW_LENGTH);
      g.fillStyle = ew ? '#57c24a' : mw ? '#f08a3c' : (Math.floor(m / 12) % 2 ? '#2e3557' : '#394170');
      if (s && m > s.month) g.globalAlpha = 0.9; else g.globalAlpha = 0.45;
      g.fillRect(x + 1, 30, tw - 2, 44); g.globalAlpha = 1;
      if (s && m === (s.deadline ?? -1)) { g.fillStyle = '#e8553f'; g.fillRect(x + tw - 4, 20, 6, 64); }
    }
    g.fillStyle = '#d9cfae'; g.font = `bold 26px ${HEAD}`; g.textAlign = 'center';
    for (let y = 0; y < 12; y++) g.fillText(`'${String((START_YEAR + y) % 100).padStart(2, '0')}`, 120 + (y * 12 + 6) * tw, 108);
    // 軌道の線
    g.setLineDash([18, 14]); g.lineWidth = 6;
    const curve = (k, color) => { const [a, b, c] = ARC[k]; g.strokeStyle = color; g.beginPath(); g.moveTo(...a); g.quadraticCurveTo(...b, ...c); g.stroke(); };
    curve('mto', s?.earthOpen ? '#7ed957' : '#6c7bb8'); curve('eto', s?.marsOpen ? '#f2a65a' : '#6c7bb8');
    g.setLineDash([]);
    // 地球と火星の周り
    g.lineWidth = 5; g.strokeStyle = '#5a8fd8'; g.beginPath(); g.arc(...EARTH_C, 310, 0, 7); g.stroke();
    g.strokeStyle = '#d9734a'; g.beginPath(); g.arc(...MARS_C, 310, 0, 7); g.stroke();
    g.fillStyle = 'rgba(70,130,220,0.25)'; g.beginPath(); g.arc(...EARTH_C, 175, 0, 7); g.fill();
    g.fillStyle = 'rgba(220,100,60,0.22)'; g.beginPath(); g.arc(...MARS_C, 145, 0, 7); g.fill();
    // マス
    const label = (p, text, color, sub, above) => {
      const y0 = above ? p[1] - 52 - 92 : p[1] + 52;
      g.fillStyle = 'rgba(10,12,25,0.75)'; g.strokeStyle = color; g.lineWidth = 6;
      g.beginPath(); g.roundRect(p[0] - 140, y0, 280, 92, 18); g.fill(); g.stroke();
      g.fillStyle = '#fff'; g.font = `bold 36px ${HEAD}`; g.textAlign = 'center'; g.fillText(text, p[0], y0 + 44);
      if (sub) { g.font = `bold 26px ${BODY}`; g.fillStyle = color; g.fillText(sub, p[0], y0 + 78); }
      g.fillStyle = color; g.beginPath(); g.arc(p[0], p[1], 44, 0, 7); g.globalAlpha = 0.35; g.fill(); g.globalAlpha = 1;
      g.lineWidth = 6; g.stroke();
    };
    label(NODE_PX.earth, '地球・発射場', '#7ed957', '難しさ 5');
    label(NODE_PX.leo, '地球低軌道', '#5a8fd8', '再突入:耐熱', true);
    label(NODE_PX.mars_orbit, '火星周回軌道', '#d9734a', s?.landKnown ? `着陸 ${s.landDiff}` : '着陸 ?', true);
    label(NODE_PX.mars_surface, '火星の地表', '#d9734a', '離陸 3');
    label(NODE_PX.mars_approach, '火星接近', '#f2c94c', '減速 2/空力');
    label(NODE_PX.earth_approach, '地球接近', '#f2c94c', '減速 2/再突入');
    g.font = `bold 34px ${HEAD}`; g.textAlign = 'center';
    g.fillStyle = s?.earthOpen ? '#7ed957' : '#aab4e0'; g.fillText(s?.earthOpen ? '▶ 火星への窓 OPEN(難しさ3・7か月)' : '火星へ(難しさ3・7か月)', 1024, 200);
    g.fillStyle = s?.marsOpen ? '#f2a65a' : '#aab4e0'; g.fillText(s?.marsOpen ? '◀ 地球への窓 OPEN(難しさ3・8か月)' : '地球へ(難しさ3・8か月)', 1024, 1140);
    g.font = `bold 60px ${HEAD}`; g.fillStyle = 'rgba(217,207,174,0.18)'; g.fillText('REDLINE TO MARS', 1024, 660);
    boardTex.t.needsUpdate = true;
  }

  // ---------- モニターと指示ボードの文字 ----------
  function drawCRT(info) {
    const g = crt.g; g.fillStyle = '#0b1a0e'; g.fillRect(0, 0, 512, 384);
    g.fillStyle = '#7dff8a'; g.font = '30px "VT323", monospace'; g.textAlign = 'left';
    const lines = info.crt || [];
    lines.forEach((l, i) => g.fillText(l, 22, 44 + i * 34));
    g.fillStyle = 'rgba(0,0,0,0.25)'; for (let y = 0; y < 384; y += 4) g.fillRect(0, y, 512, 2);
    crt.t.needsUpdate = true;
  }
  function drawIB(title, sub) {
    const g = ibTex.g;
    g.fillStyle = '#2b2f33'; g.fillRect(0, 0, 1024, 560);
    g.fillStyle = 'rgba(255,255,255,0.03)'; for (let y = 0; y < 560; y += 14) g.fillRect(0, y, 1024, 6);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = `68px ${HEAD}`;
    const n = wrap(g, title, 512, 150, 900, 82);
    g.font = `bold 40px ${BODY}`; g.fillStyle = '#e9e3cf';
    wrap(g, sub || '', 512, 150 + n * 82 + 40, 880, 54);
    ibTex.t.needsUpdate = true;
  }

  // ---------- 演出 ----------
  const particles = [];
  function burst(at, color, n = 26, size = 0.008) {
    for (let i = 0; i < n; i++) {
      const p = box(size, size, size, new THREE.MeshBasicMaterial({ color: i % 3 ? color : '#ffd34d' }), [at.x, at.y, at.z]);
      p.castShadow = false;
      p.userData.v = new THREE.Vector3((Math.random() - 0.5) * 0.4, Math.random() * 0.45, (Math.random() - 0.5) * 0.4);
      p.userData.life = 1; scene.add(p); particles.push(p);
    }
  }
  let outsideLaunch = 0;
  let btnPress = 0;
  function effect(kind, data = {}) {
    if (kind === 'launch') { outsideLaunch = 1; }
    if (kind === 'lost') { const pc = pieces.get(data.craftId); burst(pc ? pc.group.position : boardPos, '#e8553f', 40); }
    if (kind === 'press') btnPress = 1;
    if (kind === 'confetti') burst(new THREE.Vector3(0, boardY + 0.1, -0.4), '#7ed957', 70, 0.01);
  }

  // ---------- state に合わせる ----------
  let lastS = null;
  function update(s, info) {
    lastS = s;
    drawBoard({ earthOpen: info.earthOpen, marsOpen: info.marsOpen, landKnown: s.known.landDiff, landDiff: s.mars.landDiff, month: s.month, deadline: info.deadline });
    drawCalendar(Math.min(s.month, 143));
    drawCRT(info);
    drawIB(info.hintTitle, info.hintSub);
    paper.visible = !!s.pendingEvent;
    faxLight.material.emissive.set(s.pendingEvent ? '#ff3b2f' : '#000000');
    lights[0].material.emissive.set(info.earthOpen ? '#3fdc3f' : '#1f4a1f');
    lights[1].material.emissive.set(info.marsOpen ? '#ff9a3c' : '#1f4a1f');
    const tp = toWorld([trackX(Math.min(s.month, 143)), 52], 0);
    pawn.position.set(tp.x, boardY, tp.z);
    // コマ
    const alive = new Set();
    const groups = {};
    for (const c of s.crafts) { if (c.loc === 'earth') continue; const k = c.loc === 'mto' || c.loc === 'eto' ? `${c.loc}:${c.arrive}` : c.loc; (groups[k] ||= []).push(c); }
    for (const list of Object.values(groups)) list.forEach((c, i) => {
      alive.add(c.id);
      let pc = pieces.get(c.id);
      if (!pc) { pc = makePiece(c); pieces.set(c.id, pc); pc.group.position.copy(toWorld(NODE_PX.earth)); }
      pc.target.copy(toWorld(craftPx(s, c, i, list.length)));
    });
    for (const [id, pc] of pieces) if (!alive.has(id)) {
      scene.remove(pc.group);
      const i = pickables.indexOf(pc.group); if (i >= 0) pickables.splice(i, 1);
      pieces.delete(id);
    }
  }

  // ---------- 視点(マウスで少し見回す) ----------
  const look = { x: 0, y: 0, tx: 0, ty: 0 };
  let zoom = 0, zoomT = 0;
  const ray = new THREE.Raycaster(); const mouse = new THREE.Vector2(); let hovered = null;
  const el = renderer.domElement;
  function setMouse(e) { const r = el.getBoundingClientRect(); mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); }
  function pick() {
    ray.setFromCamera(mouse, camera);
    const hit = ray.intersectObjects(pickables, true)[0];
    return hit ? hit.object : null;
  }
  el.addEventListener('pointermove', (e) => {
    setMouse(e);
    if (e.pointerType === 'mouse') { look.tx = mouse.x * 0.32; look.ty = mouse.y * 0.16; }
    const o = pick();
    hovered = o;
    el.style.cursor = o ? 'pointer' : 'default';
    handlers.onHover?.(o ? o.userData.tip : null, e.clientX, e.clientY);
  });
  el.addEventListener('pointerleave', () => { handlers.onHover?.(null); look.tx = 0; look.ty = 0; });
  el.addEventListener('click', (e) => { setMouse(e); const o = pick(); if (o) handlers.onPick?.(o.userData.action); });
  el.addEventListener('wheel', (e) => { zoomT = Math.max(-0.2, Math.min(0.6, zoomT - e.deltaY * 0.001)); e.preventDefault(); }, { passive: false });
  function setZoom(v) { zoomT = v; }

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    camera.fov = w / h < 0.8 ? 74 : w / h < 1.2 ? 62 : 54;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize); resize();

  const clockT = new THREE.Clock();
  const tmpLook = new THREE.Vector3();
  function frame() {
    const dt = Math.min(0.05, clockT.getDelta()); const t = clockT.elapsedTime;
    look.x += (look.tx - look.x) * Math.min(1, dt * 4); look.y += (look.ty - look.y) * Math.min(1, dt * 4);
    zoom += (zoomT - zoom) * Math.min(1, dt * 5);
    // 少しだけ呼吸するように揺れる
    const bob = Math.sin(t * 0.8) * 0.003;
    camera.position.set(camBase.x + look.x * 0.15, camBase.y + bob - zoom * 0.35, camBase.z - zoom * 0.55);
    tmpLook.set(lookBase.x + look.x * 1.2, lookBase.y + look.y * 1.4 - zoom * 0.05, lookBase.z);
    camera.lookAt(tmpLook);
    earth.rotation.y += dt * 0.3; mars.rotation.y += dt * 0.22;
    for (const pc of pieces.values()) {
      pc.group.position.lerp(pc.target, Math.min(1, dt * 2.2));
      const moving = pc.group.position.distanceTo(pc.target) > 0.004;
      pc.group.position.y = boardY + (moving ? 0.03 : 0) + Math.sin(t * 2 + pc.group.id) * 0.002;
      pc.group.rotation.y += dt * (moving ? 3 : 0.4);
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]; p.userData.v.y -= dt * 0.9; p.position.addScaledVector(p.userData.v, dt);
      p.rotation.x += dt * 5; p.userData.life -= dt * 0.8; p.scale.setScalar(Math.max(0.01, p.userData.life));
      if (p.userData.life <= 0) { scene.remove(p); particles.splice(i, 1); }
    }
    // 窓の外のロケット
    if (outsideLaunch > 0) {
      outsideLaunch += dt;
      const k = outsideLaunch - 1;
      bigRocket.position.y = k > 0.6 ? (k - 0.6) ** 2 * 3 : 0;
      if (Math.random() < 0.5 && k < 5 && smoke.length < 50) {
        const sm = mesh(smokeGeo, smokeMat.clone(), [pad.position.x + (Math.random() - 0.5) * 0.4, 0.2 + bigRocket.position.y, pad.position.z + (Math.random() - 0.5) * 0.4]);
        sm.userData.life = 1; outside.add(sm); smoke.push(sm);
      }
      if (k > 7) { outsideLaunch = 0; bigRocket.position.y = 0; }
    }
    for (let i = smoke.length - 1; i >= 0; i--) {
      const sm = smoke[i]; sm.userData.life -= dt * 0.25; sm.scale.multiplyScalar(1 + dt * 0.6); sm.position.y += dt * 0.15;
      sm.material.opacity = Math.max(0, sm.userData.life * 0.8);
      if (sm.userData.life <= 0) { outside.remove(sm); sm.material.dispose(); smoke.splice(i, 1); }
    }
    // ボタン
    if (btnPress > 0) { btnPress = Math.max(0, btnPress - dt * 4); }
    cap.position.y = 0.055 - btnPress * 0.02;
    cap.material.emissiveIntensity = 0.35 + Math.sin(t * 3) * 0.15 + (hovered && hovered.userData.action === 'next' ? 0.4 : 0);
    if (lastS?.pendingEvent) { faxLight.material.emissiveIntensity = (Math.sin(t * 6) > 0) ? 1 : 0.2; paper.position.y = 0.12 + Math.sin(t * 2) * 0.004; }
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  drawBoard(null); drawIB('読み込み中…', '');

  return { update, effect, setZoom, resize, showText: drawIB };
}
