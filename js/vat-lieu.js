// Materials with two states: ink (paper colour, read as a line drawing with the
// edge lines on top) and the real material. A room's sweep front moves across
// the room and turns ink into material behind it.

import * as THREE from 'three';
import { PHONG, QUET } from './cau-hinh.js';
import { NHA } from './du-lieu.js';
import { GOC_TAI_NGUYEN } from './tai-nguyen.js';

export const GIAY = '#efebe2'; // paper
export const MUC = '#1f1d1a'; // ink
export const CAT_MAT_BANG = 1.2; // plan cut height above floor, m

// One clipping plane for everything: keeps what lies below `constant`.
export const CAT = new THREE.Plane(new THREE.Vector3(0, -1, 0), CAT_MAT_BANG);
// The surroundings follow the cut only while the house is being raised.
export const CAT_QUANH = new THREE.Plane(new THREE.Vector3(0, -1, 0), CAT_MAT_BANG);

const NR = PHONG.length;
const NGHI = -1e4; // front value meaning "not started"
const MEM = 1.2; // metres over which ink turns into material

const lin = (hex) => new THREE.Color().setStyle(hex, THREE.LinearSRGBColorSpace);

export const U = {
  uGiay: { value: lin(GIAY) },
  uHop: { value: PHONG.map((p) => new THREE.Vector4(p.hcn[0] / 1000, -p.hcn[3] / 1000, p.hcn[2] / 1000, -p.hcn[1] / 1000)) },
  uCao: { value: PHONG.map((p) => new THREE.Vector2(p.z[0] / 1000 - 0.03, p.z[1] / 1000 + 0.03)) },
  uQuet: { value: QUET.map((q) => new THREE.Vector4(q.ox, q.oz, q.dx, q.dz)) },
  uMat: { value: new Float32Array(NR).fill(NGHI) },
  uMem: { value: MEM },
};

// Line clipping planes: a room's edge lines disappear behind its sweep front.
export const MP_QUET = QUET.map((q) => new THREE.Plane(new THREE.Vector3(q.dx, 0, q.dz), 1e4));

// t: 0 = drawing, 1 = material
export function datLoRa(i, t) {
  const q = QUET[i];
  const front = t <= 0 ? NGHI : -0.5 + t * (q.dai + MEM + 1.0);
  U.uMat.value[i] = front;
  MP_QUET[i].constant = -(q.ox * q.dx + q.oz * q.dz + front - MEM * 0.5);
}

const KHAI_BAO = /* glsl */ `
#define NR ${NR}
varying vec3 vViTri;
varying vec3 vPhap;
uniform vec3 uGiay;
uniform vec4 uHop[NR];
uniform vec2 uCao[NR];
uniform vec4 uQuet[NR];
uniform float uMat[NR];
uniform float uMem;
uniform float uKinh;
uniform float uNgoai;

int phongCua(vec3 q) {
  if (uNgoai > 0.5) return NR - 1;
  for (int i = 0; i < NR; i++) {
    vec4 b = uHop[i];
    if (q.x > b.x && q.x < b.z && q.z > b.y && q.z < b.w && q.y > uCao[i].x && q.y < uCao[i].y) return i;
  }
  return NR - 1;
}
float mucCua(vec3 q, int r) {
  vec4 s = uQuet[r];
  float d = dot(q.xz - s.xy, s.zw);
  float f = uMat[r];
  return smoothstep(f - uMem, f, d);
}
`;

function vaoMuc(material, { kinh = false, ngoai = false, quanh = false } = {}) {
  material.clippingPlanes = [quanh ? CAT_QUANH : CAT];
  const rieng = { uKinh: { value: kinh ? 1 : 0 }, uNgoai: { value: ngoai ? 1 : 0 } };
  material.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, rieng);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vViTri;\nvarying vec3 vPhap;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvViTri = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvPhap = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + KHAI_BAO)
      .replace('#include <dithering_fragment>', /* glsl */ `#include <dithering_fragment>
      {
        vec3 n = normalize(vPhap) * (gl_FrontFacing ? 1.0 : -1.0);
        vec3 q = vViTri + n * 0.03;
        float muc = mucCua(q, phongCua(q));
        if (uKinh > 0.5) {
          gl_FragColor.a *= (1.0 - muc);
        } else {
          vec3 rua = uGiay * (1.0 - 0.06 * abs(n.x) - 0.035 * abs(n.z));
          gl_FragColor.rgb = mix(gl_FragColor.rgb, rua, muc);
        }
      }`);
  };
  material.customProgramCacheKey = () => 'muc' + (kinh ? 'K' : '') + (ngoai ? 'N' : '') + (quanh ? 'Q' : '');
  return material;
}

// ---- textures -------------------------------------------------------------
const nap = new THREE.TextureLoader();
const cho = [];
let doNet = 8;
export const datDoNet = (n) => (doNet = n);
export const vanSanSang = () => Promise.all(cho);
let daXong = 0;
export const tienDoVan = () => [daXong, cho.length];

// 1x1 stand-ins so materials render flat (no shader change) until the real
// texture arrives: white colour/roughness, a flat normal
const tamThoi = (rgb) => {
  const c = document.createElement('canvas');
  c.width = c.height = 1;
  const g = c.getContext('2d');
  g.fillStyle = rgb;
  g.fillRect(0, 0, 1, 1);
  return c;
};
const TAM = { mau: tamThoi('#ffffff'), nham: tamThoi('#ffffff'), nor: tamThoi('#8080ff') };

function van(ten, kenh, { srgb = false, co = 1, xoay = 0 } = {}) {
  const t = new THREE.Texture(TAM[kenh]);
  t.needsUpdate = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / co, 1 / co);
  t.rotation = xoay;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  // light .webp (tools/nen_van.py); the full-size .jpg only if it is missing
  const duong = `${GOC_TAI_NGUYEN}van/${ten}/${kenh}`;
  cho.push(nap.loadAsync(duong + '.webp').catch(() => nap.loadAsync(duong + '.jpg')).then((src) => {
    daXong++;
    t.image = src.image;
    t.anisotropy = doNet;
    t.needsUpdate = true;
  }));
  return t;
}

function pbr(ten, { co = 1, xoay = 0, mau = 0xffffff, nham = 1, normal = 1, sonPhang = false, ...tuy } = {}) {
  const m = new THREE.MeshStandardMaterial({
    color: mau,
    // sonPhang: painted surface, keep only the relief and roughness of the scan
    map: sonPhang ? null : van(ten, 'mau', { srgb: true, co, xoay }),
    normalMap: van(ten, 'nor', { co, xoay }),
    roughnessMap: van(ten, 'nham', { co, xoay }),
    roughness: nham,
    metalness: 0,
  });
  m.normalScale.set(normal, normal);
  return vaoMuc(m, tuy);
}

const phang = (mau, { nham = 0.8, kim = 0, phat = 0x000000, cuong = 1, ...tuy } = {}) =>
  vaoMuc(new THREE.MeshStandardMaterial({ color: mau, roughness: nham, metalness: kim, emissive: phat, emissiveIntensity: cuong }), tuy);

// Modern palette chosen with the owner (16/10/2026): ivory render, warm grey
// stone, light oak, walnut cladding, black aluminium, charcoal metal roof.
// It departs on purpose from the drawing's colour notes (red-brown roof,
// green PVC pipes); the README says so.
export function taoVatLieu() {
  const M = {};
  // ---- shell
  M.tuongKem = pbr('white_stucco', { co: 2.2, mau: 0xf6f2ea, normal: 0.15, nham: 0.95, sonPhang: true }); // interior paint
  M.tuongKemNgoai = pbr('white_stucco', { co: 2.4, mau: 0xf7f3ec, normal: 0.45, nham: 0.95, ngoai: true }); // exterior render
  M.opGo = pbr('natural_walnut_veneer', { co: 1.1, xoay: Math.PI / 2, mau: 0xe8d7c6, normal: 0.5, nham: 0.55 }); // walnut cladding
  M.opGoNgoai = pbr('natural_walnut_veneer', { co: 1.1, xoay: Math.PI / 2, mau: 0xe8d7c6, normal: 0.5, nham: 0.55, ngoai: true });
  M.cotXam = pbr('white_stucco', { co: 2.4, mau: 0xdedbd5, normal: 0.3, nham: 0.9, sonPhang: true }); // column and slab edge
  M.ton = pbr('corrugated_iron', { co: 1.4, mau: 0x55595d, normal: 1, nham: 0.5, ngoai: true }); // charcoal metal roof
  M.ton.metalness = 0.35;
  M.khungNhom = phang(0x1d1e20, { nham: 0.38, kim: 0.55 }); // black aluminium
  M.kinh = vaoMuc(new THREE.MeshPhysicalMaterial({ color: 0xe6eeee, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.16, depthWrite: false, envMapIntensity: 1.6 }), { kinh: true });
  M.ongXoi = phang(0x2d2f32, { nham: 0.5, ngoai: true });
  M.trang = phang(0xf3f2ef, { nham: 0.35 });
  M.thepNau = phang(0x1f2022, { nham: 0.45, kim: 0.5, ngoai: true }); // black steel: pergola, gates, fence
  M.poly = vaoMuc(new THREE.MeshPhysicalMaterial({ color: 0xf7f5ef, roughness: 0.35, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide }), { kinh: true, ngoai: true });
  M.beTong = pbr('concrete_floor_02', { co: 3, mau: 0xe0dcd4, normal: 0.5, nham: 0.9 });
  M.inox = phang(0xd7dadd, { nham: 0.25, kim: 0.9, ngoai: true });
  // office-tower finishes: blue reflective curtain wall, beige stone, black
  // granite, painted lift doors, laminate WC partitions
  M.kinhMatDung = phang(0x7f9fbe, { nham: 0.04, kim: 0.95, ngoai: true });
  M.daOp = pbr('marble_01', { co: 1.4, mau: 0xd8c9ad, normal: 0.35, nham: 0.45 });
  M.daDen = pbr('marble_01', { co: 1.2, mau: 0x2b2a29, normal: 0.3, nham: 0.25 });
  M.thangMay = phang(0x1f5fae, { nham: 0.3, kim: 0.6 });
  M.vachWC = phang(0xcbb798, { nham: 0.45 });
  M.datNen = pbr('leafy_grass', { co: 3.5, mau: 0xb4cf92, normal: 0.8, nham: 1 });
  M.nhua = pbr('asphalt_02', { co: 4, mau: 0xb9b6b2, normal: 0.6, nham: 0.95, ngoai: true });
  M.nhaBen = pbr('white_stucco', { co: 3, mau: 0xe4dfd6, normal: 0.3, nham: 0.95, sonPhang: true, ngoai: true, quanh: true });
  M.kinhBen = phang(0x3e464b, { nham: 0.12, kim: 0.4, ngoai: true, quanh: true });
  // ---- floors and ceilings
  M.da = pbr('marble_01', { co: 2.2, mau: 0xfaf6ef, normal: 0.3, nham: 0.45 }); // pale limestone
  M.sanGo = pbr('oak_wood_planks', { co: 2.4, mau: 0xf4ece2, normal: 0.45, nham: 0.7 });
  M.gach = pbr('floor_tiles_06', { co: 1.2, mau: 0xe9e7e3, normal: 0.5, nham: 0.55 });
  M.tran = phang(0xf7f5f0, { nham: 1 });
  // ---- furniture and objects
  M.go = pbr('oak_wood_planks', { co: 1.2, mau: 0xf0e6da, normal: 0.3, nham: 0.6 });
  M.goSoi = M.go;
  M.goToi = pbr('natural_walnut_veneer', { co: 1.0, mau: 0xd9c6b3, normal: 0.4, nham: 0.5 });
  M.oc = M.goToi;
  M.vai = pbr('rough_linen', { co: 0.7, mau: 0xf1ebe0, normal: 0.7, nham: 1 });
  M.vaiSang = pbr('rough_linen', { co: 0.7, mau: 0xeadcc6, normal: 0.8, nham: 1 });
  M.vaiTrang = pbr('rough_linen', { co: 0.7, mau: 0xfbf8f2, normal: 0.6, nham: 1 });
  M.vaiKem = pbr('rough_linen', { co: 0.7, mau: 0xe9dcc6, normal: 0.8, nham: 1 });
  M.vaiToi = pbr('rough_linen', { co: 0.7, mau: 0x6f6a64, normal: 0.8, nham: 1 });
  M.tham = pbr('poly_wool_herringbone', { co: 0.9, mau: 0xe8e0d2, normal: 0.8, nham: 1 });
  M.datNung = phang(0xa9583a, { nham: 0.9 }); // terracotta accents
  M.oliu = phang(0x737048, { nham: 0.95 });
  M.cat = phang(0xcdb898, { nham: 0.95 });
  M.trangMo = phang(0xece9e3, { nham: 0.5 });
  M.denKim = phang(0x1b1b1c, { nham: 0.4, kim: 0.6 });
  M.kimLoai = phang(0xbfc2c4, { nham: 0.3, kim: 0.85 });
  M.dong = phang(0xa8803e, { nham: 0.35, kim: 0.9 });
  M.gom = phang(0xf4f2ee, { nham: 0.2 });
  M.gomDen = phang(0x2b2724, { nham: 0.5 });
  M.guong = phang(0xc9d0d2, { nham: 0.02, kim: 1 });
  M.manHinh = phang(0x0d0e10, { nham: 0.15, kim: 0.2 });
  M.khungAnh = phang(0x3a3330, { nham: 0.6 });
  M.kinhToi = phang(0x22272b, { nham: 0.1, kim: 0.4 });
  M.sachA = phang(0xe5dccb, { nham: 0.9 });
  M.sachB = phang(0x8a4b33, { nham: 0.9 });
  M.sachC = phang(0x3f4a4a, { nham: 0.9 });
  M.denSang = phang(0xfff3df, { nham: 0.6, phat: 0xffd9a6, cuong: 2.2 });
  M.denTran = phang(0xfff6e8, { nham: 1, phat: 0xffe2b8, cuong: 1.6 });
  M.xe = phang(0x9aa0a6, { nham: 0.25, kim: 0.8, ngoai: true });
  M.kinhXe = phang(0x1b2126, { nham: 0.08, kim: 0.6, ngoai: true });
  M.lop = phang(0x151515, { nham: 0.8, ngoai: true });
  M.la = phang(0x52683b, { nham: 0.85 });
  M.laNgoai = phang(0x4f6638, { nham: 0.85, ngoai: true, quanh: true });
  M.thanCay = phang(0x5b4a3c, { nham: 0.9, ngoai: true, quanh: true });
  M.cay = M.la;
  M.chau = phang(0xb9b2a8, { nham: 0.85 });
  M.dat = phang(0x3b2f26, { nham: 1 });

  // 'theo-ban-ve': the colours most Vietnamese drawings specify
  if (NHA.bang_mau === 'theo-ban-ve') {
    for (const k of ['tuongKem', 'tuongKemNgoai']) M[k].color.set(0xf1e3c6);
    for (const k of ['opGo', 'opGoNgoai']) M[k].color.set(0xb98d6c);
    M.ton.color.set(0xa4553d);
    M.ton.metalness = 0.1;
    M.khungNhom.color.set(0x8a8e92);
    M.ongXoi.color.set(0x3f8f4e);
    M.thepNau.color.set(0x6e2f24);
  }
  // per-material colour overrides from the description: { "ton": "#3a3d40", ... }
  for (const [k, v] of Object.entries(NHA.mau_vat_lieu ?? {})) if (M[k]?.color) M[k].color.set(v);
  return M;
}
