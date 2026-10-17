// A plan sheet that becomes the house as you scroll (vn-phoi-canh-cuon).
//
// URL options for checking without a person scrolling:
//   ?s=0.42          render one fixed frame
//   ?quay=720        render 720 evenly spaced frames and POST each to /chup
//                    (tools/may_chu.py saves them; make a video or a contact sheet)
//   ?anh=0,0.2,0.5   render and POST only these frames

import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { NHA } from './du-lieu.js';
import { TANG, PHONG, phongTai, trongNha, COT_SAN_VUON, NHA_HCN, DINH } from './cau-hinh.js';
import { GIAY, MUC, CAT, CAT_QUANH, MP_QUET, datLoRa, taoVatLieu, vanSanSang, datDoNet, tienDoVan } from './vat-lieu.js';
import { dungNha } from './hinh.js';
import { dungNoiThat } from './noi-that.js';
import { taoDuongDi, MOC } from './duong-di.js';
import { taoToGiay } from './to-giay.js';
import { GOC_TAI_NGUYEN } from './tai-nguyen.js';

const thamSo = new URLSearchParams(location.search);
const CHUP = thamSo.has('s') || thamSo.has('quay') || thamSo.has('anh');
const loi = (window.__loi = []);
window.addEventListener('error', (e) => loi.push(String(e.message)));

// ---------------------------------------------------------------------------
// page text from the description
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const tenCT = NHA.ten_cong_trinh ?? 'Công trình';
document.title = `${tenCT} · Phối cảnh`;
for (const el of document.querySelectorAll('[data-ten]')) el.textContent = tenCT;
for (const el of document.querySelectorAll('[data-don-vi]')) el.textContent = NHA.don_vi ?? '';
if (NHA.mo_ta) $('hero-dan').textContent = NHA.mo_ta;
$('kt-tang1').textContent = `Mặt bằng ${TANG[0].ten.toLowerCase()}`;

// ---------------------------------------------------------------------------
// renderer, scene, camera
// ---------------------------------------------------------------------------
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: CHUP });
renderer.setPixelRatio(CHUP ? 1 : Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.localClippingEnabled = true;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
datDoNet(renderer.capabilities.getMaxAnisotropy());

const scene = new THREE.Scene();
const MAU_GIAY = new THREE.Color(GIAY);
scene.background = MAU_GIAY.clone();
scene.environmentIntensity = 0.5;

const camera = new THREE.PerspectiveCamera(2, 1, 1, 2000);
camera.rotation.order = 'YXZ';

const bauTroi = new THREE.Mesh(
  new THREE.SphereGeometry(700, 48, 24),
  new THREE.MeshBasicMaterial({ side: THREE.BackSide, transparent: true, opacity: 0, depthWrite: false, fog: false }),
);
bauTroi.renderOrder = -10;
scene.add(bauTroi);
const TROI = GOC_TAI_NGUYEN + 'troi/qwantani_late_afternoon_puresky_';
const choTroi = new RGBELoader().loadAsync(TROI + '1k.hdr').catch(() => new RGBELoader().loadAsync(TROI + '2k.hdr')).then((hdr) => {
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = new THREE.PMREMGenerator(renderer).fromEquirectangular(hdr).texture;
  bauTroi.material.map = hdr;
  bauTroi.material.needsUpdate = true;
});

// ---------------------------------------------------------------------------
// the house
// ---------------------------------------------------------------------------
const M = taoVatLieu();
const X = dungNha();
const nha = new THREE.Group();
scene.add(nha);
const trongSuot = [];
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
  if (trong) { mesh.renderOrder = 3; trongSuot.push(mesh); }
  nha.add(mesh);
}
for (const r of X.rieng) {
  const mesh = new THREE.Mesh(r.g, M[r.mat]);
  mesh.castShadow = mesh.receiveShadow = true;
  nha.add(mesh);
}
const NT = dungNoiThat(M);
nha.add(NT.nhom);
NT.nhom.traverse((o) => { if (o.isMesh && o.material === M.kinh) trongSuot.push(o); });

const nen = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), M.datNen);
nen.rotation.x = -Math.PI / 2;
nen.position.y = COT_SAN_VUON / 1000 - 0.31;
nen.receiveShadow = true;
scene.add(nen);

// ---------------------------------------------------------------------------
// ink lines, grouped by room so each room's lines leave with its sweep
// ---------------------------------------------------------------------------
const NET = { 'cau-truc': 1.25, 'noi-that': 0.75, manh: 0.5 };
const vatLieuNet = [], tatCaNet = [];
function nhomNet(viTri, rong, mp, mau = MUC, them = {}) {
  const g = new LineSegmentsGeometry();
  g.setPositions(viTri);
  const m = new LineMaterial({ color: new THREE.Color(mau), linewidth: rong, worldUnits: false, toneMapped: false, clippingPlanes: mp, ...them });
  vatLieuNet.push(m);
  const l = new LineSegments2(g, m);
  l.frustumCulled = false;
  l.renderOrder = 1;
  tatCaNet.push(l);
  return l;
}
const ngoaiTroi = ([x, y, z]) => !trongNha(x * 1000, -z * 1000, y * 1000);
{
  const theo = {};
  const NGOAI = PHONG.length - 1;
  for (const e of X.canh) {
    const m = [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2, (e.a[2] + e.b[2]) / 2];
    const d = m.map((v, i) => (Math.abs(v - e.c[i]) > 1e-4 ? Math.sign(v - e.c[i]) * 0.05 : 0));
    let r = phongTai(m[0] + d[0], m[1] + d[1], m[2] + d[2]);
    for (const k of [0, 2]) {
      if (!d[k] || r === NGOAI) continue;
      const p = [m[0], m[1], m[2]];
      p[k] += d[k];
      if (ngoaiTroi(p)) r = NGOAI;
    }
    (theo[e.loai + '|' + r] ??= []).push(...e.a, ...e.b);
  }
  for (const v of NT.net) if (v.pos.length) (theo['noi-that|' + phongTai(...v.diem)] ??= []).push(...v.pos);
  for (const k in theo) {
    const [loai, r] = k.split('|');
    nha.add(nhomNet(theo[k], NET[loai], [CAT, MP_QUET[+r]]));
  }
}

// caps: black where the cut goes through walls, columns, slabs
const NAP = X.nap;
const napMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: MUC, toneMapped: false }), Math.max(1, NAP.length));
napMesh.frustumCulled = false;
scene.add(napMesh);
const tmp = new THREE.Matrix4(), an = new THREE.Matrix4().makeScale(0, 0, 0);
let catCu = null;
function datNap(cat) {
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
}

// ---------------------------------------------------------------------------
// light: late afternoon sun from the street side, warm lamps inside
// ---------------------------------------------------------------------------
const [hx0, hy0, hx1, hy1] = NHA_HCN;
const tamNha = new THREE.Vector3((hx0 + hx1) / 2000, DINH / 3000, -(hy0 + hy1) / 2000);
const coNha = Math.max(hx1 - hx0, hy1 - hy0, DINH) / 1000;
const nang = new THREE.DirectionalLight(0xffd2a1, 5.5);
nang.target.position.copy(tamNha);
nang.position.copy(tamNha).add(new THREE.Vector3(-0.55, 0.45, 0.65).multiplyScalar(coNha * 2.2 + 20));
nang.castShadow = true;
nang.shadow.mapSize.set(4096, 4096);
const sc = coNha * 0.9 + 8;
Object.assign(nang.shadow.camera, { left: -sc, right: sc, top: sc, bottom: -sc, near: 1, far: coNha * 5 + 80 });
nang.shadow.bias = -0.0003;
nang.shadow.normalBias = 0.02;
nang.shadow.radius = 4;
scene.add(nang, nang.target);
scene.add(new THREE.HemisphereLight(0xfff0dc, 0xd8c6aa, 0.45));
for (const p of PHONG.slice(0, -1).filter((q) => q.loai !== 'ngoai_troi').slice(0, 16)) {
  const [x0, y0, x1, y1] = p.hcn;
  const area = ((x1 - x0) * (y1 - y0)) / 1e6;
  const l = new THREE.PointLight(0xffd6a8, Math.min(9, 3 + area * 0.25), 8, 2);
  l.position.set((x0 + x1) / 2000, p.z[0] / 1000 + Math.min(2.9, (p.z[1] - p.z[0]) / 1000 - 0.4), -(y0 + y1) / 2000);
  scene.add(l);
}

// ---------------------------------------------------------------------------
// post: ambient occlusion while on foot
// ---------------------------------------------------------------------------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const ao = new GTAOPass(scene, camera, 1, 1);
ao.blendIntensity = 0.85;
ao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.2, thickness: 1.2, scale: 1.1 });
const matBang = {};
const ngoaiAO = () => [...tatCaNet, ...trongSuot, napMesh, bauTroi, ...Object.values(matBang).flatMap((m) => [m.to, m.net])];
const gocAO = ao.renderOverride.bind(ao);
ao.renderOverride = (...a) => {
  const an2 = ngoaiAO().filter((o) => o && o.visible);
  an2.forEach((o) => (o.visible = false));
  gocAO(...a);
  an2.forEach((o) => (o.visible = true));
};
composer.addPass(ao);
composer.addPass(new OutputPass());

// ---------------------------------------------------------------------------
// layout and overlay
// ---------------------------------------------------------------------------
let dd;
function bocCuc() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  camera.aspect = w / h;
  dd = taoDuongDi(w / h);
  for (const m of vatLieuNet) m.resolution.set(w, h);
  $('duong').style.height = `${1400 + 260 * dd.moc.length}vh`;
  const box = $('thuoc');
  box.innerHTML = '';
  for (const m of dd.moc) {
    const i = document.createElement('i');
    i.style.top = (m.s * 100).toFixed(2) + '%';
    i.title = m.cap.a;
    box.appendChild(i);
  }
}
function capNhatChu(s, ngoai) {
  const k = (a, b) => Math.min(1, Math.max(0, (s - a) / (b - a)));
  $('hero').style.opacity = String(1 - k(0.008, 0.028));
  $('khung-ten').style.opacity = String(1 - k(MOC.giay, MOC.giay + 0.03));
  $('cat').style.opacity = s > MOC.nghieng && s < MOC.dung + 0.01 ? '1' : '0';
  $('hat').style.opacity = String(0.55 * (1 - ngoai));
  let hien = null;
  for (const m of dd.moc) if (s >= m.s - 0.008 && s < m.s + 0.04) hien = m;
  const cap = $('chu-thich');
  if (hien && s < 0.965) {
    if (cap.dataset.ten !== hien.cap.a) {
      cap.dataset.ten = hien.cap.a;
      cap.querySelector('b').textContent = hien.cap.a;
      cap.querySelector('span').textContent = hien.cap.b;
    }
    cap.classList.add('hien');
  } else cap.classList.remove('hien');
  $('cuoi').classList.toggle('hien', s > 0.96);
  $('tien-do').style.height = (s * 100).toFixed(2) + '%';
}

// ---------------------------------------------------------------------------
// one frame
// ---------------------------------------------------------------------------
let cuoiCung = null;
function ve(s) {
  const o = dd.tai(s);
  cuoiCung = o;
  camera.position.set(o.x, o.y, o.z);
  camera.rotation.set(o.pitch, o.yaw, 0);
  camera.fov = o.fov;
  camera.near = o.near;
  camera.far = o.far;
  camera.updateProjectionMatrix();
  CAT.constant = o.cat;
  CAT_QUANH.constant = s < MOC.phu ? o.cat : 99;
  datNap(o.cat);
  const lo = dd.loRa(s);
  lo.forEach((t, i) => datLoRa(i, t));
  const ngoai = lo[lo.length - 1];
  bauTroi.material.opacity = ngoai;
  bauTroi.visible = ngoai > 0.001;
  bauTroi.position.copy(camera.position);
  for (const t of TANG) {
    const mb = matBang[t.ma];
    let a;
    if (t.i === 0) a = 1 - Math.min(1, Math.max(0, (s - MOC.giay) / 0.025));
    else a = o.pitch < -1.2 && o.y > mb.to.userData.catMatBang + 4 ? Math.max(0, 1 - Math.abs(o.cat - mb.to.userData.catMatBang) / 0.25) : 0;
    mb.to.material.opacity = a;
    mb.to.visible = a > 0.001;
    mb.net.material.opacity = a;
    mb.net.visible = a > 0.001;
  }
  if (o.cat > 50 && o.y < DINH / 1000) composer.render();
  else renderer.render(scene, camera);
  capNhatChu(s, ngoai);
}

// ---------------------------------------------------------------------------
// start
// ---------------------------------------------------------------------------
async function guiKhung(ten) {
  const url = canvas.toDataURL('image/jpeg', 0.88);
  for (let k = 0; k < 5; k++) {
    try { await fetch('/chup?ten=' + ten, { method: 'POST', body: url }); return; } catch { await new Promise((r) => setTimeout(r, 300)); }
  }
}

async function batDau() {
  await Promise.race([document.fonts.load('600 40px "Be Vietnam Pro"'), new Promise((r) => setTimeout(r, 2500))]);
  for (const t of TANG) {
    const to = taoToGiay(t);
    scene.add(to);
    const rects = NT.matBang.filter((r) => r[4] > t.e && r[4] < t.e + 1300);
    const p = [];
    for (const [x0, y0, x1, y1, z] of rects) {
      const X0 = x0 / 1000, X1 = x1 / 1000, Z0 = -y1 / 1000, Z1 = -y0 / 1000, Y = z / 1000;
      p.push(X0, Y, Z0, X1, Y, Z0, X1, Y, Z0, X1, Y, Z1, X1, Y, Z1, X0, Y, Z1, X0, Y, Z1, X0, Y, Z0);
    }
    const net = nhomNet(p.length ? p : [0, 0, 0, 0, 0, 0], 0.8, [], MUC, { transparent: true });
    scene.add(net);
    matBang[t.ma] = { to, net };
  }
  // The opening (paper plan, line drawing, floors rising) needs no textures,
  // so the page opens at once and the textures (about 2.3 MB) and the sky load
  // behind it, with a small counter in the corner. Frame capture still waits.
  const CHUP_KHUNG = thamSo.has('quay') || thamSo.has('anh') || thamSo.has('s');
  let troiXong = false;
  choTroi.then(() => (troiXong = true));
  const chuNap = CHUP_KHUNG ? document.querySelector('.nap__chu') : document.createElement('div');
  if (!CHUP_KHUNG) { chuNap.className = 'nap-ngam'; document.body.appendChild(chuNap); }
  const demNap = setInterval(() => {
    const [a, b] = tienDoVan();
    chuNap.textContent = `Đang tải vật liệu ${Math.round((100 * (a + (troiXong ? 1 : 0))) / (b + 1))}%…`;
  }, 300);
  const xongVan = Promise.all([vanSanSang(), choTroi]).finally(() => {
    clearInterval(demNap);
    if (!CHUP_KHUNG) { chuNap.classList.add('xong'); setTimeout(() => chuNap.remove(), 1200); }
  });
  if (CHUP_KHUNG) await xongVan;
  bocCuc();
  renderer.shadowMap.needsUpdate = true;
  window.__ve = (s) => { ve(s); return { ...cuoiCung, loi: loi.slice() }; };
  window.__duongDi = () => dd;

  if (thamSo.has('quay') || thamSo.has('anh')) {
    $('nap').classList.add('xong');
    const ds = thamSo.has('anh') ? thamSo.get('anh').split(',').map(Number) : null;
    const n = ds ? ds.length : Math.max(2, parseInt(thamSo.get('quay'), 10) || 360);
    for (let i = 0; i < n; i++) {
      const s = ds ? ds[i] : i / (n - 1);
      ve(s);
      await guiKhung(ds ? 'a' + String(Math.round(s * 1000)).padStart(4, '0') : 'f' + String(i).padStart(4, '0'));
    }
    await fetch('/chup?ten=xong', { method: 'POST', body: 'data:text/plain,' + encodeURIComponent(JSON.stringify({ khung: n, loi })) }).catch(() => {});
    window.__quayXong = true;
  } else if (thamSo.has('s')) {
    ve(parseFloat(thamSo.get('s')) || 0);
  } else {
    const lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 0.8 });
    let s = 0, sVe = -1;
    const vong = (t) => {
      lenis.raf(t);
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const muc = max > 0 ? window.scrollY / max : 0;
      s += (muc - s) * 0.16;
      if (Math.abs(muc - s) < 1e-5) s = muc;
      if (s !== sVe) { sVe = s; ve(s); }
      requestAnimationFrame(vong);
    };
    requestAnimationFrame(vong);
    document.querySelectorAll('[data-len-dau]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); lenis.scrollTo(0); }));
  }
  window.addEventListener('resize', () => { bocCuc(); ve(cuoiCung ? cuoiCung.s : 0); });
  $('nap').classList.add('xong');
  window.__san = true;
}

batDau().catch((e) => { loi.push(String(e && e.stack ? e.stack : e)); console.error(e); });
