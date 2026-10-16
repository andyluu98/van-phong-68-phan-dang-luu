// Reads the house description (du-lieu.js, schema v1, see CHUAN-DU-LIEU.md)
// and derives everything the other modules need: floors and their heights,
// the top of a wall anywhere (under the next slab or under a sloped roof),
// rooms with their height range and sweep direction, and the bounds.
//
// Plan coordinates are mm: x along the street front, y into the lot.
// World coordinates are metres: X = x, Y = level, Z = -y.

import { NHA } from './du-lieu.js';

export const SAN_DAY = NHA.san_day ?? 120;
export const COT_SAN_VUON = NHA.cao_do_san_vuon ?? 0;

// ---- floors -------------------------------------------------------------
export const TANG = NHA.tang.map((t, i) => {
  const sau = NHA.tang[i + 1];
  return { ...t, i, e: t.cao_do, tren: sau ? sau.cao_do : (NHA.cao_toi_tang_tren_cung ?? t.cao_do + 3300) };
});
export const tangTheoMa = Object.fromEntries(TANG.map((t) => [t.ma, t]));
export const MB = (ma) => NHA.mat_bang[ma] ?? {};

const trongHcn = (r, x, y) => x > r[0] && x < r[2] && y > r[1] && y < r[3];

// slab of a floor covers a plan point?
function sanPhu(ma, x, y) {
  const f = MB(ma);
  if (!(f.san ?? []).some((r) => trongHcn(r, x, y))) return false;
  return !(f.lo_san ?? []).some((r) => trongHcn(r, x, y));
}

// ---- roofs: underside level at a plan point ------------------------------
export const MAI = (NHA.mai ?? []).map((m) => ({ ...m, day: m.day ?? 120 }));

export function matMai(m, x, y) {
  // top surface level of a roof at (x, y), or null outside it
  const r = m.hcn;
  if (x < r[0] - 1 || x > r[2] + 1 || y < r[1] - 1 || y > r[3] + 1) return null;
  if (m.kieu === 'doc') {
    const h = m.huong ?? '+y';
    const t = h === '+y' ? (y - r[1]) / (r[3] - r[1]) : h === '-y' ? (r[3] - y) / (r[3] - r[1])
      : h === '+x' ? (x - r[0]) / (r[2] - r[0]) : (r[2] - x) / (r[2] - r[0]);
    return m.thap + Math.min(1, Math.max(0, t)) * (m.cao - m.thap);
  }
  if (m.kieu === 'hai_doc') {
    // ridge along x (huong 'x') or along y (huong 'y'), eaves on the two long sides
    const doc = (m.huong ?? 'x') === 'x';
    const a0 = doc ? r[1] : r[0], a1 = doc ? r[3] : r[2], v = doc ? y : x;
    const t = 1 - Math.abs(v - (a0 + a1) / 2) / ((a1 - a0) / 2);
    return m.thap + Math.min(1, Math.max(0, t)) * (m.cao - m.thap);
  }
  return m.cao; // bang, tam_trong
}

// the lowest roof underside above a level at (x, y)
export function duoiMai(x, y, tren) {
  let best = null;
  for (const m of MAI) {
    if (m.kieu === 'tam_trong') continue;
    const s = matMai(m, x, y);
    if (s === null) continue;
    const u = s - m.day;
    if (u > tren - 600 && (best === null || u < best)) best = u;
  }
  return best;
}

// top of a wall on floor t at plan point (x, y)
export function dinhTuong(t, x, y) {
  const sau = TANG[t.i + 1];
  if (sau && sanPhu(sau.ma, x, y)) return sau.cao_do - SAN_DAY;
  const m = duoiMai(x, y, t.e + 1500);
  if (m !== null) return m;
  return t.tren - SAN_DAY;
}

// ---- bounds ---------------------------------------------------------------
const tatCaSan = TANG.flatMap((t) => MB(t.ma).san ?? []);
export const NHA_HCN = tatCaSan.length
  ? [Math.min(...tatCaSan.map((r) => r[0])), Math.min(...tatCaSan.map((r) => r[1])), Math.max(...tatCaSan.map((r) => r[2])), Math.max(...tatCaSan.map((r) => r[3]))]
  : [0, 0, 10000, 10000];
export const LO_DAT = NHA.lo_dat ?? [NHA_HCN[0] - 2000, NHA_HCN[1] - 4000, NHA_HCN[2] + 2000, NHA_HCN[3] + 2000];
export const DINH = Math.max(TANG[TANG.length - 1].tren, ...MAI.map((m) => m.cao)) + 1500;

// is a plan point at a level inside the building envelope (under a slab or roof)?
export function trongNha(x, y, z) {
  for (const t of TANG) {
    if (z < t.e - SAN_DAY || z > t.tren + 50) continue;
    if ((MB(t.ma).san ?? []).some((r) => trongHcn(r, x, y))) {
      // open-air rooms (balcony, roof terrace) are outside
      const p = (MB(t.ma).phong ?? []).find((q) => trongHcn(q.hcn, x, y));
      if (p && p.loai === 'ngoai_troi') return false;
      if (z > dinhTuong(t, x, y) + 30) return false;
      return true;
    }
  }
  return false;
}

// ---- rooms ------------------------------------------------------------------
// direction a room's materials sweep in: away from its door (plan dir)
function huongQuet(t, p) {
  const f = MB(t.ma);
  const [x0, y0, x1, y1] = p.hcn;
  for (const c of f.cua ?? []) {
    if (!(NHA.loai_cua?.[c.ma]?.kieu ?? 'so').startsWith('so')) {
      const [a0, b0, a1, b1] = c.hcn;
      const cx = (a0 + a1) / 2, cy = (b0 + b1) / 2, tol = 260;
      if (cx > x0 && cx < x1) {
        if (Math.abs(cy - y0) < tol) return '+y';
        if (Math.abs(cy - y1) < tol) return '-y';
      }
      if (cy > y0 && cy < y1) {
        if (Math.abs(cx - x0) < tol) return '+x';
        if (Math.abs(cx - x1) < tol) return '-x';
      }
    }
  }
  return '+y';
}

export const PHONG = [];
for (const t of TANG) {
  const ds = MB(t.ma).phong ?? [];
  // small rooms first: a point in a WC inside a hall belongs to the WC
  const xep = [...ds].sort((a, b) => (a.hcn[2] - a.hcn[0]) * (a.hcn[3] - a.hcn[1]) - (b.hcn[2] - b.hcn[0]) * (b.hcn[3] - b.hcn[1]));
  for (const p of xep) {
    const [x0, y0, x1, y1] = p.hcn;
    let z1;
    if (p.loai === 'ngoai_troi') z1 = t.e + 4000;
    else if (t.cao_tran) z1 = t.e + t.cao_tran;
    else {
      // highest ceiling in the room (sloped roofs)
      z1 = -Infinity;
      for (const fx of [0.1, 0.5, 0.9]) for (const fy of [0.1, 0.5, 0.9]) z1 = Math.max(z1, dinhTuong(t, x0 + (x1 - x0) * fx, y0 + (y1 - y0) * fy));
    }
    PHONG.push({ ma: `${t.ma}-${PHONG.length}`, ten: p.ten, loai: p.loai ?? '', tang: t.ma, tenTang: t.ten, hcn: p.hcn, san: p.san, z: [t.e, z1], huong: huongQuet(t, p) });
  }
}
// everything else: yard, street, roofs, facades. The outside sweep runs from the street.
PHONG.push({
  ma: 'ngoai', ten: 'Mặt ngoài', loai: 'ngoai', tang: '', hcn: [-200000, -200000, 200000, 200000],
  quet: [LO_DAT[0] - 6000, LO_DAT[1] - 6000, LO_DAT[2] + 6000, LO_DAT[3] + 6000], z: [-10000, 200000], huong: '+y',
});

const DIR = { '+x': [1, 0], '-x': [-1, 0], '+y': [0, -1], '-y': [0, 1] }; // plan dir -> world (dx, dz)
export const QUET = PHONG.map((p) => {
  const [x0, y0, x1, y1] = (p.quet ?? p.hcn).map((v) => v / 1000);
  const [dx, dz] = DIR[p.huong];
  const ox = dx > 0 ? x0 : dx < 0 ? x1 : (x0 + x1) / 2;
  const oz = dz < 0 ? -y0 : dz > 0 ? -y1 : -(y0 + y1) / 2;
  const dai = Math.abs(dx) * (x1 - x0) + Math.abs(dz) * (y1 - y0);
  return { ox, oz, dx, dz, dai: Math.min(dai, 40) };
});

// index of the room containing a world point (same rule as the shader)
export function phongTai(X, Y, Z) {
  const x = X * 1000, y = -Z * 1000, z = Y * 1000;
  for (let i = 0; i < PHONG.length; i++) {
    const p = PHONG[i];
    if (x > p.hcn[0] && x < p.hcn[2] && y > p.hcn[1] && y < p.hcn[3] && z > p.z[0] - 30 && z < p.z[1] + 30) return i;
  }
  return PHONG.length - 1;
}

// floor whose storey contains a level (mm)
export function tangTai(z) {
  let t = TANG[0];
  for (const k of TANG) if (z >= k.e - 50) t = k;
  return t;
}
