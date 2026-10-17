// Free tour (vn-phoi-canh-cuon): the same model as the scroll page, explored by hand.
//
// - Overview: the selected floor cut at 1.2 m like a plan, orbit with mouse or
//   fingers; room names float over the model, click one to go in.
// - Inside: stand at eye height, drag to look around, click/tap the floor to
//   walk there (the path goes through doors, never through walls).
// - The side panel lists the rooms of each floor; other floors are reached
//   through the overview, like reading the drawings.
//
// URL option for checking without a person: ?kiem=1 runs a short scripted
// visit and POSTs each frame to /chup (tools/may_chu.py saves them).

import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { NHA } from './du-lieu.js';
import { TANG, MB, PHONG, phongTai, COT_SAN_VUON, NHA_HCN, DINH } from './cau-hinh.js';
import { MUC, CAT, CAT_QUANH, datLoRa, taoVatLieu, vanSanSang, datDoNet, tienDoVan } from './vat-lieu.js';
import { dungNha } from './hinh.js';
import { dungNoiThat } from './noi-that.js';
import { dungLuoi, timDuong, rutGon, diemNhin, ganNhat } from './duong-di.js';
import { GOC_TAI_NGUYEN } from './tai-nguyen.js';

const thamSo = new URLSearchParams(location.search);
const KIEM = thamSo.has('kiem');
const loi = (window.__loi = []);
window.addEventListener('error', (e) => loi.push(String(e.message)));
const $ = (id) => document.getElementById(id);
const CHAM = matchMedia('(pointer: coarse)').matches; // phone or tablet
const MAT = 1.6; // eye height, m

const tenCT = NHA.ten_cong_trinh ?? 'Công trình';
document.title = `${tenCT} · Tham quan`;
for (const el of document.querySelectorAll('[data-ten]')) el.textContent = tenCT;
for (const el of document.querySelectorAll('[data-don-vi]')) el.textContent = NHA.don_vi ?? '';
$('goi-y').textContent = CHAM ? 'Vuốt để nhìn quanh · Chạm sàn để đi tới' : 'Kéo chuột để nhìn quanh · Bấm sàn để đi tới';

// ---------------------------------------------------------------------------
// renderer, scene, camera
// ---------------------------------------------------------------------------
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !CHAM, powerPreference: 'high-performance', preserveDrawingBuffer: KIEM });
renderer.setPixelRatio(KIEM ? 1 : Math.min(window.devicePixelRatio || 1, CHAM ? 1.5 : 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.localClippingEnabled = true;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
datDoNet(renderer.capabilities.getMaxAnisotropy());

const scene = new THREE.Scene();
scene.background = new THREE.Color('#dfe5e8');
scene.environmentIntensity = 0.5;
const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 2500);
camera.rotation.order = 'YXZ';

const bauTroi = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), new THREE.MeshBasicMaterial({ side: THREE.BackSide, depthWrite: false, fog: false }));
bauTroi.renderOrder = -10;
bauTroi.visible = false;
scene.add(bauTroi);
const TROI = GOC_TAI_NGUYEN + 'troi/qwantani_late_afternoon_puresky_';
const choTroi = new RGBELoader().loadAsync(TROI + '1k.hdr').catch(() => new RGBELoader().loadAsync(TROI + '2k.hdr')).then((hdr) => {
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = new THREE.PMREMGenerator(renderer).fromEquirectangular(hdr).texture;
  bauTroi.material.map = hdr;
  bauTroi.material.needsUpdate = true;
  bauTroi.visible = true;
  veLai();
});

// ---------------------------------------------------------------------------
// the house, all rooms in their real materials
// ---------------------------------------------------------------------------
const M = taoVatLieu();
PHONG.forEach((_, i) => datLoRa(i, 1));
const X = dungNha();
const nha = new THREE.Group();
scene.add(nha);
for (const key in X.nhom) {
  const B = X.nhom[key];
  if (!M[key]) { loi.push('thieu vat lieu ' + key); continue; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(B.p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(B.n, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(B.uv, 2));
  g.setIndex(B.idx);
  const mesh = new THREE.Mesh(g, M[key]);
  const trong = key === 'kinh' || key === 'poly';
  mesh.castShadow = !trong && key !== 'denTran';
  mesh.receiveShadow = !trong;
  if (trong) mesh.renderOrder = 3;
  nha.add(mesh);
}
for (const r of X.rieng) {
  const mesh = new THREE.Mesh(r.g, M[r.mat]);
  mesh.castShadow = mesh.receiveShadow = true;
  nha.add(mesh);
}
nha.add(dungNoiThat(M).nhom);
const nen = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), M.datNen);
nen.rotation.x = -Math.PI / 2;
nen.position.y = COT_SAN_VUON / 1000 - 0.31;
nen.receiveShadow = true;
scene.add(nen);

// black caps where the plan cut goes through walls, columns, slabs
const NAP = X.nap;
const napMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: MUC, toneMapped: false }), Math.max(1, NAP.length));
napMesh.frustumCulled = false;
scene.add(napMesh);
const tmp = new THREE.Matrix4(), an = new THREE.Matrix4().makeScale(0, 0, 0);
let catCu = null;
function datCat(cat) {
  CAT.constant = cat;
  CAT_QUANH.constant = 99;
  if (cat === catCu) return;
  catCu = cat;
  NAP.forEach((n, i) => {
    if (n.z0 / 1000 < cat - 0.001 && n.z1 / 1000 > cat + 0.001) {
      tmp.makeScale((n.x1 - n.x0) / 1000, 1, (n.y1 - n.y0) / 1000);
      tmp.setPosition((n.x0 + n.x1) / 2000, cat - 0.0015, -(n.y0 + n.y1) / 2000);
      napMesh.setMatrixAt(i, tmp);
    } else napMesh.setMatrixAt(i, an);
  });
  napMesh.instanceMatrix.needsUpdate = true;
  renderer.shadowMap.needsUpdate = true;
}

// light: late afternoon sun, warm lamps inside
const [hx0, hy0, hx1, hy1] = NHA_HCN;
const tamNha = new THREE.Vector3((hx0 + hx1) / 2000, DINH / 3000, -(hy0 + hy1) / 2000);
const coNha = Math.max(hx1 - hx0, hy1 - hy0, DINH) / 1000;
const nang = new THREE.DirectionalLight(0xffd2a1, 5.5);
nang.target.position.copy(tamNha);
nang.position.copy(tamNha).add(new THREE.Vector3(-0.55, 0.45, 0.65).multiplyScalar(coNha * 2.2 + 20));
nang.castShadow = true;
nang.shadow.mapSize.set(CHAM ? 2048 : 4096, CHAM ? 2048 : 4096);
const sc = coNha * 0.9 + 8;
Object.assign(nang.shadow.camera, { left: -sc, right: sc, top: sc, bottom: -sc, near: 1, far: coNha * 5 + 80 });
nang.shadow.bias = -0.0003;
nang.shadow.normalBias = 0.02;
nang.shadow.radius = 4;
scene.add(nang, nang.target);
scene.add(new THREE.HemisphereLight(0xfff0dc, 0xd8c6aa, 0.45));
for (const p of PHONG.slice(0, -1).filter((q) => q.loai !== 'ngoai_troi' && q.ten).slice(0, 24)) {
  const [x0, y0, x1, y1] = p.hcn;
  const area = ((x1 - x0) * (y1 - y0)) / 1e6;
  const l = new THREE.PointLight(0xffd6a8, Math.min(9, 3 + area * 0.25), 9, 2);
  l.position.set((x0 + x1) / 2000, p.z[0] / 1000 + Math.min(2.9, (p.z[1] - p.z[0]) / 1000 - 0.4), -(y0 + y1) / 2000);
  scene.add(l);
}

// floor marker under the pointer while inside
const vong = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.28, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }));
vong.renderOrder = 5;
vong.visible = false;
scene.add(vong);

// ---------------------------------------------------------------------------
// rooms and where to stand in each
// ---------------------------------------------------------------------------
const rad = Math.PI / 180;
const luoi = TANG.map((t) => dungLuoi(t));
const tangCua = (p) => TANG.find((t) => t.ma === p.tang);
const PHONG_TEN = PHONG.slice(0, -1).filter((p) => p.ten);
const yawToi = (a, b) => Math.atan2(-(b[0] - a[0]), b[1] - a[1]);
function diemDung(p) {
  const t = tangCua(p);
  const ds = [...(NHA.bat_dau ? [{ ...NHA.bat_dau }] : []), ...(NHA.tham_quan ?? [])];
  for (const q of ds) {
    if (!q.tu || q.tang !== p.tang) continue;
    const r = phongTai(q.tu[0] / 1000, t.e / 1000 + 1, -q.tu[1] / 1000);
    if ((q.phong && String(q.phong).toUpperCase() === p.ten.toUpperCase()) || PHONG[r] === p) {
      return { x: q.tu[0], y: q.tu[1], nhin: q.nhin ?? [(p.hcn[0] + p.hcn[2]) / 2, (p.hcn[1] + p.hcn[3]) / 2] };
    }
  }
  return gocRong(t, p) ?? diemNhin(luoi[t.i], t, p);
}

// What blocks the eye: walls and columns only (furniture is below eye level,
// glass is seen through). Same cells as the walking grid.
const chanMat = TANG.map((t) => {
  const L = luoi[t.i], f = MB(t.ma);
  const m = new Uint8Array(L.nx * L.ny);
  for (const r of [...(f.tuong ?? []), ...(f.cot ?? [])]) {
    const [i0, j0] = L.o(r[0], r[1]), [i1, j1] = L.o(r[2] - 1, r[3] - 1);
    for (let j = Math.max(0, j0); j <= Math.min(L.ny - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(L.nx - 1, i1); i++) m[j * L.nx + i] = 1;
  }
  return m;
});
// Where to stand in a room for the widest view across it: try standing spots
// on a 300 mm grid and 24 headings, score each by how far the eye sees inside
// the room over a 60 degree fan.
const NHUONG = 24;
// Small rooms (a pantry, a stair) are seen best from their doorway, like a
// photographer would: spots up to 1.5 m outside the room count too, but only
// the depth seen inside the room scores.
function gocRong(t, p) {
  const L = luoi[t.i], m = chanMat[t.i];
  const [x0, y0, x1, y1] = p.hcn, ngoai = 1500;
  const trong = (x, y) => x > x0 && x < x1 && y > y0 && y < y1;
  const sau = (x, y, a) => {
    const dx = Math.cos(a) * 100, dy = Math.sin(a) * 100;
    let d = 0;
    for (let k = 1; k <= 180; k++) {
      x += dx; y += dy;
      if (x < x0 - ngoai || x > x1 + ngoai || y < y0 - ngoai || y > y1 + ngoai) break;
      const [i, j] = L.o(x, y);
      if (i < 0 || j < 0 || i >= L.nx || j >= L.ny || m[j * L.nx + i]) break;
      if (trong(x, y)) d++;
    }
    return d / 10; // m of room in view
  };
  let best = null, bs = -1;
  for (let y = y0 - ngoai; y <= y1 + ngoai; y += 300) for (let x = x0 - ngoai; x <= x1 + ngoai; x += 300) {
    if (!L.tu(...L.o(x, y))) continue;
    const vao = trong(x, y);
    // outside spots only for rooms too tight to stand back in
    if (!vao && (x1 - x0) * (y1 - y0) > 16e6) continue;
    const ds = [];
    for (let h = 0; h < NHUONG; h++) ds.push(sau(x, y, (h * 2 * Math.PI) / NHUONG));
    for (let h = 0; h < NHUONG; h++) {
      const quat = [-2, -1, 0, 1, 2].map((k) => ds[(h + k + NHUONG) % NHUONG]);
      const s = quat.reduce((a, b) => a + b, 0) / 5 + 0.25 * Math.min(...quat) + (vao ? 0.4 : 0);
      if (s > bs) { bs = s; best = { x, y, a: (h * 2 * Math.PI) / NHUONG }; }
    }
  }
  if (!best) return null;
  return { x: best.x, y: best.y, nhin: [best.x + Math.cos(best.a) * 3000, best.y + Math.sin(best.a) * 3000] };
}

// ---------------------------------------------------------------------------
// camera state and moves
// ---------------------------------------------------------------------------
const dk = new OrbitControls(camera, canvas);
dk.enableDamping = true;
dk.dampingFactor = 0.08;
dk.maxPolarAngle = 1.32;
dk.minDistance = 6;
dk.maxDistance = coNha * 4 + 40;
dk.screenSpacePanning = false;
dk.addEventListener('change', () => veLai());

let cheDo = 'tong'; // 'tong' overview, 'di' inside
let tangChon = TANG[0];
let toanNha = false; // overview of the whole building, no cut
const tu = { yaw: 0, pitch: 0 };
let chuyen = null; // running move: { buoc: [...], i, t0 }

const tuThe = () => ({ p: camera.position.clone(), yaw: camera.rotation.y, pitch: camera.rotation.x, fov: camera.fov });
const ganYaw = (y, truoc) => { while (y - truoc > Math.PI) y -= 2 * Math.PI; while (y - truoc < -Math.PI) y += 2 * Math.PI; return y; };
const io = (t) => t * t * (3 - 2 * t);
function nhinVao(p, dich) {
  const d = dich.clone().sub(p);
  return { yaw: Math.atan2(-d.x, -d.z), pitch: Math.atan2(d.y, Math.hypot(d.x, d.z)) };
}
function tamTang(t) {
  const [x0, y0, x1, y1] = NHA_HCN;
  return toanNha ? new THREE.Vector3((x0 + x1) / 2000, DINH / 2600, -(y0 + y1) / 2000) : new THREE.Vector3((x0 + x1) / 2000, t.e / 1000, -(y0 + y1) / 2000);
}
function viTriTong(t) {
  const tam = tamTang(t);
  const kc = toanNha ? coNha * 1.7 + 8 : Math.max(hx1 - hx0, hy1 - hy0) / 1000 * (camera.aspect < 0.9 ? 1.9 : 1.15) + 4;
  return tam.clone().add(new THREE.Vector3(-0.42, toanNha ? 0.62 : 1.05, 0.9).normalize().multiplyScalar(kc));
}
const catTong = () => (toanNha ? 99 : tangChon.e / 1000 + 1.2);

// a move is a list of steps { p, yaw, pitch, fov, dur, cat? }
function chay(buoc, xong) {
  dk.enabled = false;
  const a = tuThe();
  chuyen = { buoc: buoc.map((b) => ({ ...b })), i: 0, t0: performance.now(), tu: a, xong };
  let truoc = a.yaw;
  for (const b of chuyen.buoc) { b.yaw = ganYaw(b.yaw ?? truoc, truoc); truoc = b.yaw; }
  veLai();
}
function buocChuyen(now) {
  const c = chuyen;
  const b = c.buoc[c.i];
  const k = Math.min(1, (now - c.t0) / (b.dur * 1000));
  const e = b.deu ? k : io(k);
  const a = c.tu;
  camera.position.lerpVectors(a.p, b.p, e);
  camera.rotation.set(a.pitch + (b.pitch - a.pitch) * e, a.yaw + (b.yaw - a.yaw) * e, 0);
  camera.fov = a.fov + ((b.fov ?? a.fov) - a.fov) * e;
  camera.updateProjectionMatrix();
  if (k >= 1) {
    c.i++;
    c.t0 = now;
    c.tu = { p: b.p.clone(), yaw: b.yaw, pitch: b.pitch, fov: b.fov ?? a.fov };
    if (c.i >= c.buoc.length) { chuyen = null; c.xong?.(); }
  }
}

const fovDi = () => (camera.aspect < 0.9 ? 78 : 66);
// wider lens in tight rooms
const fovPhong = (p) => ((p.hcn[2] - p.hcn[0]) * (p.hcn[3] - p.hcn[1]) < 16e6 ? fovDi() + 12 : fovDi());

function denTong(t, xong) {
  cheDo = 'tong';
  tangChon = t;
  vong.visible = false;
  hienPhong(null);
  const dich = viTriTong(t), tam = tamTang(t);
  const h = nhinVao(dich, tam);
  const tren = camera.position.clone().setY(Math.max(camera.position.y, tam.y + 6));
  const buoc = [];
  if (camera.position.y < tam.y + 3.2) buoc.push({ p: tren, yaw: tu.yaw, pitch: -1.1, fov: 55, dur: 1.0 });
  buoc.push({ p: dich, yaw: h.yaw, pitch: h.pitch, fov: 40, dur: 1.4 });
  chay(buoc, () => {
    dk.target.copy(tam);
    dk.enabled = true;
    dk.update();
    xong?.();
  });
  capNhatBang();
}

function vaoPhong(p) {
  const t = tangCua(p);
  if (cheDo === 'di' && t !== tangChon) { denTong(t, () => vaoPhong(p)); return; }
  const v = diemDung(p);
  const dich = [v.x, v.y];
  const yawCuoi = yawToi(dich, v.nhin);
  if (cheDo === 'di') { diToi(dich, yawCuoi, fovPhong(p)); return; }
  // from the overview: come down into the room
  tangChon = t;
  const pD = new THREE.Vector3(v.x / 1000, t.e / 1000 + MAT, -v.y / 1000);
  const tren = pD.clone().add(new THREE.Vector3(Math.sin(yawCuoi) * 3, 4.5, Math.cos(yawCuoi) * 3));
  cheDo = 'di';
  chay([
    { p: tren, yaw: yawCuoi, pitch: -0.75, fov: 60, dur: 1.3 },
    { p: pD, yaw: yawCuoi, pitch: -0.05, fov: fovPhong(p), dur: 1.4 },
  ], () => { tu.yaw = camera.rotation.y; tu.pitch = camera.rotation.x; hienPhongTai(); });
  capNhatBang();
}

// walk on the current floor to a plan point (mm), then face yawCuoi if given
function diToi(dich, yawCuoi, fov) {
  const t = tangChon, L = luoi[t.i];
  const tuDau = [camera.position.x * 1000, -camera.position.z * 1000];
  const g = ganNhat(L, ...dich);
  if (!g) return;
  const den = L.tam(...g);
  const duong = (rutGon(L, timDuong(L, tuDau, den)) ?? [tuDau, den]).slice(1);
  if (!duong.length) return;
  const y = t.e / 1000 + MAT;
  const buoc = [];
  let truoc = tuDau;
  for (const q of duong) {
    const dai = Math.hypot(q[0] - truoc[0], q[1] - truoc[1]) / 1000;
    if (dai < 0.05) continue;
    buoc.push({ p: new THREE.Vector3(q[0] / 1000, y, -q[1] / 1000), yaw: yawToi(truoc, q), pitch: -0.05, dur: Math.max(0.35, dai / 1.7), deu: true });
    truoc = q;
  }
  if (yawCuoi !== undefined) buoc.push({ p: buoc.length ? buoc[buoc.length - 1].p : camera.position.clone(), yaw: yawCuoi, pitch: -0.05, fov, dur: 0.8 });
  if (!buoc.length) return;
  vong.visible = false;
  chay(buoc, () => { tu.yaw = camera.rotation.y; tu.pitch = camera.rotation.x; hienPhongTai(); });
}

// ---------------------------------------------------------------------------
// pointer: orbit (overview), look and walk (inside)
// ---------------------------------------------------------------------------
const tia = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function diemSan(cx, cy) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  tia.setFromCamera(ndc, camera);
  const mp = new THREE.Plane(new THREE.Vector3(0, 1, 0), -tangChon.e / 1000);
  const d = new THREE.Vector3();
  if (!tia.ray.intersectPlane(mp, d)) return null;
  if (d.distanceTo(camera.position) > 40) return null;
  return d;
}
const keo = { dang: false, x: 0, y: 0, dau: 0, x0: 0, y0: 0, so: new Map() };
canvas.addEventListener('pointerdown', (e) => {
  keo.so.set(e.pointerId, e);
  keo.dang = true; keo.x = keo.x0 = e.clientX; keo.y = keo.y0 = e.clientY; keo.dau = performance.now();
  canvas.classList.add('dang-keo');
  if (cheDo === 'di') canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (cheDo === 'di' && keo.dang && !chuyen && keo.so.size === 1) {
    const s = CHAM ? 0.006 : 0.004;
    tu.yaw += (e.clientX - keo.x) * s;
    tu.pitch = Math.max(-1.2, Math.min(1.2, tu.pitch + (e.clientY - keo.y) * s));
    camera.rotation.set(tu.pitch, tu.yaw, 0);
    veLai();
  }
  keo.x = e.clientX; keo.y = e.clientY;
  if (cheDo === 'di' && !keo.dang && !CHAM && !chuyen) {
    const d = diemSan(e.clientX, e.clientY);
    const L = luoi[tangChon.i];
    vong.visible = !!d && L.tu(...L.o(d.x * 1000, -d.z * 1000));
    if (vong.visible) vong.position.set(d.x, tangChon.e / 1000 + 0.02, d.z);
    veLai();
  }
});
const tha = (e) => {
  keo.so.delete(e.pointerId);
  if (!keo.dang) return;
  keo.dang = false;
  canvas.classList.remove('dang-keo');
  const cham = Math.hypot(e.clientX - keo.x0, e.clientY - keo.y0) < 7 && performance.now() - keo.dau < 400;
  if (!cham || chuyen) return;
  const d = diemSan(e.clientX, e.clientY);
  if (!d) return;
  if (cheDo === 'di') {
    diToi([d.x * 1000, -d.z * 1000]);
  } else if (!toanNha) {
    const r = phongTai(d.x, tangChon.e / 1000 + 1, d.z);
    const p = PHONG[r];
    if (p && p.ten && p.tang === tangChon.ma) vaoPhong(p);
  }
};
canvas.addEventListener('pointerup', tha);
canvas.addEventListener('pointercancel', (e) => { keo.so.delete(e.pointerId); keo.dang = false; });
canvas.addEventListener('wheel', (e) => {
  if (cheDo !== 'di') return;
  e.preventDefault();
  camera.fov = Math.max(35, Math.min(85, camera.fov + Math.sign(e.deltaY) * 4));
  camera.updateProjectionMatrix();
  veLai();
}, { passive: false });

// ---------------------------------------------------------------------------
// overlay: floors, rooms, labels over the overview
// ---------------------------------------------------------------------------
function capNhatBang() {
  const tab = $('tab');
  tab.innerHTML = '';
  const nutTab = (chu, chon, bam) => {
    const b = document.createElement('button');
    b.textContent = chu;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(chon));
    b.onclick = bam;
    tab.appendChild(b);
  };
  nutTab('Toàn nhà', cheDo === 'tong' && toanNha, () => { toanNha = true; denTong(tangChon); });
  for (const t of TANG) nutTab(t.ten, !(cheDo === 'tong' && toanNha) && t === tangChon, () => { toanNha = false; denTong(t); });
  const ds = $('ds');
  ds.innerHTML = '';
  const hienTai = cheDo === 'di' ? PHONG[phongTai(camera.position.x, camera.position.y - 0.5, camera.position.z)] : null;
  for (const p of PHONG_TEN.filter((q) => q.tang === tangChon.ma)) {
    const b = document.createElement('button');
    b.textContent = (p.ten.charAt(0) + p.ten.slice(1).toLowerCase()).replace(/^Wc\b/, 'WC');
    if (p === hienTai) b.classList.add('dang');
    b.onclick = () => { toanNha = false; vaoPhong(p); };
    ds.appendChild(b);
  }
  $('nut-tong').textContent = cheDo === 'di' ? 'Ra tổng quan tầng' : 'Xoay về góc ban đầu';
}
function hienPhong(p) {
  const el = $('phong-hien');
  if (!p) { el.classList.remove('hien'); return; }
  el.innerHTML = `${p.ten}<small>${p.tenTang}</small>`;
  el.classList.add('hien');
}
function hienPhongTai() {
  const p = PHONG[phongTai(camera.position.x, camera.position.y - 0.5, camera.position.z)];
  hienPhong(p && p.ten ? p : null);
  capNhatBang();
}

const nhanEl = $('nhan');
const nhan = PHONG_TEN.map((p) => {
  const b = document.createElement('button');
  b.textContent = p.ten;
  b.onclick = () => vaoPhong(p);
  nhanEl.appendChild(b);
  return { p, b, v: new THREE.Vector3() };
});
function datNhan() {
  const hien = cheDo === 'tong' && !toanNha && !chuyen;
  const w = window.innerWidth, h = window.innerHeight;
  for (const n of nhan) {
    if (!hien || n.p.tang !== tangChon.ma) { n.b.style.display = 'none'; continue; }
    const [x0, y0, x1, y1] = n.p.hcn;
    n.v.set((x0 + x1) / 2000, tangChon.e / 1000 + 1.25, -(y0 + y1) / 2000).project(camera);
    if (n.v.z > 1) { n.b.style.display = 'none'; continue; }
    n.b.style.display = '';
    n.b.style.left = ((n.v.x + 1) / 2 * w).toFixed(1) + 'px';
    n.b.style.top = ((1 - n.v.y) / 2 * h).toFixed(1) + 'px';
  }
}

$('nut-tong').onclick = () => { toanNha = false; denTong(tangChon); };
$('nut-bat-dau').onclick = () => {
  const b = NHA.bat_dau ?? (NHA.tham_quan ?? [])[0];
  let p = null;
  if (b?.tu) {
    const t = TANG.find((k) => k.ma === b.tang) ?? TANG[0];
    p = PHONG[phongTai(b.tu[0] / 1000, t.e / 1000 + 1, -b.tu[1] / 1000)];
  }
  p = p && p.ten ? p : PHONG_TEN[0];
  toanNha = false;
  vaoPhong(p);
};

// ---------------------------------------------------------------------------
// render on demand
// ---------------------------------------------------------------------------
let canVe = true;
function veLai() { canVe = true; }
function bocCuc() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  veLai();
}
window.addEventListener('resize', bocCuc);

function vongLap(now) {
  if (chuyen) { buocChuyen(now); canVe = true; }
  if (cheDo === 'tong' && dk.enabled) dk.update();
  if (canVe) { canVe = false; veKhung(); }
  requestAnimationFrame(vongLap);
}
function veKhung() {
  // cut: the plan cut over the selected floor, none when standing inside a storey
  const trongTang = cheDo === 'di' && camera.position.y < tangChon.e / 1000 + 3.0;
  datCat(cheDo === 'tong' || !trongTang ? catTong() : 99);
  bauTroi.position.copy(camera.position);
  renderer.render(scene, camera);
  datNhan();
}

// ---------------------------------------------------------------------------
// start: show the model at once, textures arrive behind it
// ---------------------------------------------------------------------------
async function guiKhung(ten) {
  veKhung();
  const url = canvas.toDataURL('image/jpeg', 0.88);
  try { await fetch('/chup?ten=' + ten, { method: 'POST', body: url }); } catch { /* not served by may_chu.py */ }
}
const doi = (ms) => new Promise((r) => setTimeout(r, ms));
// checking runs in a hidden tab where animation frames may not fire: finish moves at once
const choXong = async () => { let n = 0, gio = performance.now(); while (chuyen && n++ < 500) buocChuyen((gio += 1e6)); };

async function batDau() {
  bocCuc();
  const p0 = viTriTong(tangChon), h0 = nhinVao(p0, tamTang(tangChon));
  camera.position.copy(p0);
  camera.rotation.set(h0.pitch, h0.yaw, 0);
  camera.fov = 40;
  camera.updateProjectionMatrix();
  dk.target.copy(tamTang(tangChon));
  dk.update();
  capNhatBang();
  requestAnimationFrame(vongLap);
  $('nap').classList.add('xong');

  const chu = document.createElement('div');
  chu.className = 'nap-ngam';
  document.body.appendChild(chu);
  let troiXong = false;
  choTroi.then(() => (troiXong = true));
  const dem = setInterval(() => {
    const [a, b] = tienDoVan();
    chu.textContent = `Đang tải vật liệu ${Math.round((100 * (a + (troiXong ? 1 : 0))) / (b + 1))}%…`;
  }, 300);
  await Promise.all([vanSanSang(), choTroi]).finally(() => {
    clearInterval(dem);
    chu.classList.add('xong');
    setTimeout(() => chu.remove(), 1200);
    renderer.shadowMap.needsUpdate = true;
    veLai();
  });
  window.__tq = { vaoPhong, denTong, diToi, PHONG_TEN, diemDung, luoi, camera, dangChuyen: () => !!chuyen };

  if (KIEM) {
    const chup = async (ten) => { await choXong(); await doi(250); await guiKhung(ten); };
    await chup('k01');
    toanNha = true; denTong(tangChon); await chup('k02');
    toanNha = false; denTong(TANG[0]); await chup('k03');
    const ds = PHONG_TEN.filter((p) => p.tang === TANG[0].ma);
    for (let i = 0; i < Math.min(10, ds.length); i++) { vaoPhong(ds[i]); await chup('k' + String(4 + i).padStart(2, '0')); }
    // a tap on the floor ahead, then a drag to look left
    const ev = (kieu, x, y) => canvas.dispatchEvent(new PointerEvent(kieu, { clientX: x, clientY: y, pointerId: 1, bubbles: true, pointerType: 'mouse', isPrimary: true }));
    const w = innerWidth, h = innerHeight;
    ev('pointerdown', w * 0.5, h * 0.8); ev('pointerup', w * 0.5, h * 0.8);
    window.__kiemDi = !!chuyen;
    await chup('k13');
    ev('pointerdown', w * 0.4, h * 0.5); ev('pointermove', w * 0.6, h * 0.5); ev('pointerup', w * 0.6, h * 0.5);
    await chup('k14');
    if (TANG.length > 1) {
      const p = PHONG_TEN.find((q) => q.tang === TANG[1].ma);
      vaoPhong(p); await chup('k20');
    }
    await fetch('/chup?ten=xong', { method: 'POST', body: 'data:text/plain,' + encodeURIComponent(JSON.stringify({ loi, di: window.__kiemDi })) }).catch(() => {});
  }
}
batDau().catch((e) => { loi.push(String(e && e.stack ? e.stack : e)); console.error(e); });
