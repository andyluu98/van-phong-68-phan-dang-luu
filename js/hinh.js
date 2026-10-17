// Builds the house from the description: walls, columns, openings, slabs,
// floor finishes, stairs, roofs, the yard, and a plain context around the lot.
// Everything is boxes and prisms in plan millimetres; the builder converts to
// world metres (X = x, Y = level, Z = -y).
//
// Output:
//   nhom[matKey]  geometry buckets, one mesh per material
//   canh          edge segments with the point used to decide their room
//   nap           cap rectangles drawn at the cut, so cut solids read black
//   rieng         round things (pipes, tank, trees) as separate meshes

import * as THREE from 'three';
import { NHA } from './du-lieu.js';
import { TANG, MB, MAI, SAN_DAY, COT_SAN_VUON, PHONG, LO_DAT, NHA_HCN, dinhTuong, matMai, trongNha } from './cau-hinh.js';

// ---------------------------------------------------------------------------
// geometry buckets
// ---------------------------------------------------------------------------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

class Xay {
  constructor() {
    this.nhom = {};
    this.canh = [];
    this.nap = [];
    this.rieng = [];
  }

  _bucket(key) { return (this.nhom[key] ??= { p: [], n: [], uv: [], idx: [] }); }
  _mat(mat, n, c) { return typeof mat === 'function' ? mat(n, c) : mat; }

  // polygon face (convex, world points) facing away from `ngoai` reference point
  _mat2(mat, pts, tam) {
    let n = norm(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])));
    const c = pts.reduce((s, p) => [s[0] + p[0] / pts.length, s[1] + p[1] / pts.length, s[2] + p[2] / pts.length], [0, 0, 0]);
    if (dot(n, sub(c, tam)) < 0) { n = [-n[0], -n[1], -n[2]]; pts = [...pts].reverse(); }
    const B = this._bucket(this._mat(mat, n, c));
    const base = B.p.length / 3;
    for (const v of pts) {
      B.p.push(v[0], v[1], v[2]);
      B.n.push(n[0], n[1], n[2]);
      // world-planar uv in metres: every surface has the same texel density
      if (Math.abs(n[0]) > 0.6) B.uv.push(v[2], v[1]);
      else if (Math.abs(n[1]) > 0.6) B.uv.push(v[0], -v[2]);
      else B.uv.push(v[0], v[1]);
    }
    for (let i = 1; i < pts.length - 1; i++) B.idx.push(base, base + i, base + i + 1);
  }

  _edge(a, b, center, loai) { this.canh.push({ a, b, c: center, loai }); }

  // axis-aligned box in plan mm: x0..x1, y0..y1 (depth), z0..z1 (level)
  hop(mat, x0, y0, z0, x1, y1, z1, { canh = 'cau-truc', nap = 'muc' } = {}) {
    if (x1 - x0 < 0.5 || y1 - y0 < 0.5 || z1 - z0 < 0.5) return;
    const X0 = x0 / 1000, X1 = x1 / 1000, Y0 = z0 / 1000, Y1 = z1 / 1000, Z0 = -y1 / 1000, Z1 = -y0 / 1000;
    const v = [[X0, Y0, Z0], [X1, Y0, Z0], [X1, Y0, Z1], [X0, Y0, Z1], [X0, Y1, Z0], [X1, Y1, Z0], [X1, Y1, Z1], [X0, Y1, Z1]];
    const c = [(X0 + X1) / 2, (Y0 + Y1) / 2, (Z0 + Z1) / 2];
    for (const f of [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [3, 2, 6, 7], [0, 3, 7, 4], [1, 2, 6, 5]]) this._mat2(mat, f.map((i) => v[i]), c);
    if (canh) for (const [i, j] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) this._edge(v[i], v[j], c, canh);
    if (nap) this.nap.push({ x0, y0, x1, y1, z0, z1, mau: nap });
  }

  // prism: profile [[u, z], ...] (convex, plan mm) extruded along `truc` from s0 to s1.
  //   truc 'x': u is y, the prism runs along x.   truc 'y': u is x, it runs along y.
  lang(mat, truc, s0, s1, profile, { canh = 'cau-truc', nap = 'muc' } = {}) {
    const W = truc === 'x' ? (s, u, w) => [s / 1000, w / 1000, -u / 1000] : (s, u, w) => [u / 1000, w / 1000, -s / 1000];
    const n = profile.length;
    const A = profile.map(([u, w]) => W(s0, u, w)), B = profile.map(([u, w]) => W(s1, u, w));
    const all = [...A, ...B];
    const c = all.reduce((s, p) => [s[0] + p[0] / all.length, s[1] + p[1] / all.length, s[2] + p[2] / all.length], [0, 0, 0]);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      if (Math.hypot(...sub(A[i], A[j])) < 1e-6) continue;
      this._mat2(mat, [A[i], A[j], B[j], B[i]], c);
    }
    this._mat2(mat, A, c);
    this._mat2(mat, B, c);
    if (canh) for (let i = 0; i < n; i++) { const j = (i + 1) % n; this._edge(A[i], A[j], c, canh); this._edge(B[i], B[j], c, canh); this._edge(A[i], B[i], c, canh); }
    if (nap) {
      const us = profile.map((p) => p[0]), ws = profile.map((p) => p[1]);
      const top = Math.min(...us.map((u) => Math.max(...profile.filter((p) => p[0] === u).map((p) => p[1]))));
      const [a0, a1] = [Math.min(...us), Math.max(...us)];
      if (truc === 'x') this.nap.push({ x0: s0, y0: a0, x1: s1, y1: a1, z0: Math.min(...ws), z1: top, mau: nap });
      else this.nap.push({ x0: a0, y0: s0, x1: a1, y1: s1, z0: Math.min(...ws), z1: top, mau: nap });
    }
  }

  tru(mat, x, y, r, z0, z1, doan = 16) {
    const g = new THREE.CylinderGeometry(r / 1000, r / 1000, (z1 - z0) / 1000, doan);
    g.translate(x / 1000, (z0 + z1) / 2000, -y / 1000);
    this.rieng.push({ g, mat });
  }

  cau(mat, x, y, z, r) {
    const g = new THREE.SphereGeometry(r / 1000, 16, 10);
    g.translate(x / 1000, z / 1000, -y / 1000);
    this.rieng.push({ g, mat });
  }
}

// ---------------------------------------------------------------------------
// plan helpers
// ---------------------------------------------------------------------------
const giao = (a, b) => {
  const r = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
  return r[2] - r[0] > 1 && r[3] - r[1] > 1 ? r : null;
};
function tru(rect, lo) {
  let out = [rect];
  for (const h of lo) {
    const next = [];
    for (const r of out) {
      const g = giao(r, h);
      if (!g) { next.push(r); continue; }
      if (g[1] > r[1]) next.push([r[0], r[1], r[2], g[1]]);
      if (g[3] < r[3]) next.push([r[0], g[3], r[2], r[3]]);
      if (g[0] > r[0]) next.push([r[0], g[1], g[0], g[3]]);
      if (g[2] < r[2]) next.push([g[2], g[1], r[2], g[3]]);
    }
    out = next;
  }
  return out;
}

// break points along a wall where the ceiling above can change (roof edges and
// ridges, slab edges of the floor above)
function diemGay(t, truc, a0, a1) {
  const ds = new Set([a0, a1]);
  const them = (v) => { if (v > a0 + 1 && v < a1 - 1) ds.add(v); };
  for (const m of MAI) {
    const r = m.hcn;
    if (truc === 'y') { them(r[1]); them(r[3]); if (m.kieu === 'hai_doc' && (m.huong ?? 'x') === 'x') them((r[1] + r[3]) / 2); }
    else { them(r[0]); them(r[2]); if (m.kieu === 'hai_doc' && m.huong === 'y') them((r[0] + r[2]) / 2); }
  }
  const sau = TANG[t.i + 1];
  if (sau) for (const r of MB(sau.ma).san ?? []) { if (truc === 'y') { them(r[1]); them(r[3]); } else { them(r[0]); them(r[2]); } }
  return [...ds].sort((p, q) => p - q);
}

// on the edge of the floor's slab: an outer wall (goes up to the roof even under a ceiling)
function laTuongNgoai(t, x0, y0, x1, y1) {
  const s = MB(t.ma).san ?? [];
  return s.some((r) => x0 <= r[0] + 20 || y0 <= r[1] + 20 || x1 >= r[2] - 20 || y1 >= r[3] - 20);
}

// a wall-like block on a floor whose top follows whatever is above it
function khoi(X, mat, t, x0, y0, x1, y1, z0, opts) {
  const dai = Math.max(x1 - x0, y1 - y0);
  const truc = y1 - y0 >= x1 - x0 ? 'y' : 'x'; // the direction the block runs in
  const xc = (x0 + x1) / 2, yc = (y0 + y1) / 2;
  const [a0, a1] = truc === 'y' ? [y0, y1] : [x0, x1];
  // a ceiling (cao_tran) stops inner walls; outer walls go on up to the roof
  const tran = t.cao_tran && !laTuongNgoai(t, x0, y0, x1, y1) ? t.e + t.cao_tran : Infinity;
  const top = (a) => Math.min(tran, truc === 'y' ? dinhTuong(t, xc, a) : dinhTuong(t, a, yc));
  const ds = diemGay(t, truc, a0, a1);
  // just inside each break point the top can jump: sample both sides
  const pts = [];
  for (const a of ds) {
    const tTruoc = top(Math.max(a0 + 1, a - 1)), tSau = top(Math.min(a1 - 1, a + 1));
    pts.push([a, Math.min(tTruoc, tSau)]);
  }
  const deu = pts.every((p) => Math.abs(p[1] - pts[0][1]) < 2);
  if (deu || dai < 600) {
    X.hop(mat, x0, y0, z0, x1, y1, Math.min(...pts.map((p) => p[1])), opts);
    return;
  }
  // split into convex pieces between break points (each piece a prism)
  for (let i = 0; i < pts.length - 1; i++) {
    const [pa, za] = pts[i], [pb, zb] = pts[i + 1];
    if (pb - pa < 1) continue;
    const prof = [[pa, z0], [pb, z0], [pb, zb], [pa, za]];
    if (truc === 'y') X.lang(mat, 'x', x0, x1, prof, opts);
    else X.lang(mat, 'y', y0, y1, prof, opts);
  }
}

// face of the envelope: the air just outside it is outside the building
function laMatNgoai(n, c) {
  if (Math.abs(n[1]) > 0.5) return false;
  const x = c[0] * 1000 + n[0] * 40, y = -(c[2] * 1000) - n[2] * 40, z = c[1] * 1000;
  return !trongNha(x, y, z);
}

// exterior finish of each floor: 'son' (render), 'op_go' (timber cladding) or
// 'kinh' (reflective curtain wall over walls, columns and slab edges)
const NGOAI = (t) => ({ op_go: 'opGoNgoai', kinh: 'kinhMatDung' })[(NHA.vat_lieu_mat_ngoai ?? {})[t.ma]] ?? 'tuongKemNgoai';

// ---------------------------------------------------------------------------
// the house
// ---------------------------------------------------------------------------
export function dungNha() {
  const X = new Xay();
  const LC = NHA.lan_can_cao ?? 1000;

  for (const t of TANG) {
    const f = MB(t.ma);
    const tuong = (n, c) => (laMatNgoai(n, c) ? NGOAI(t) : Math.abs(n[1]) > 0.5 && n[1] < 0 ? 'tran' : 'tuongKem');
    const cot = (n, c) => (laMatNgoai(n, c) ? (NGOAI(t) === 'tuongKemNgoai' ? 'cotXam' : NGOAI(t)) : 'tuongKem');

    for (const [x0, y0, x1, y1] of f.tuong ?? []) khoi(X, tuong, t, x0, y0, x1, y1, t.e);
    for (const [x0, y0, x1, y1] of f.cot ?? []) khoi(X, cot, t, x0, y0, x1, y1, t.e);

    // openings: infill under the sill and over the head, then frame and glass or leaf
    for (const cua of f.cua ?? []) {
      const loai = NHA.loai_cua?.[cua.ma] ?? { rong: 900, cao: 2100, be: 0, kieu: 'di_go' };
      const [x0, y0, x1, y1] = cua.hcn;
      const be = t.e + (loai.be ?? 0), dau = be + loai.cao;
      if ((loai.be ?? 0) > 0) X.hop(tuong, x0, y0, t.e, x1, y1, be);
      khoi(X, tuong, t, x0, y0, x1, y1, dau);
      oCua(X, cua, loai, be, dau);
    }

    for (const [x0, y0, x1, y1] of f.lan_can ?? []) X.hop((n, c) => (laMatNgoai(n, c) ? 'opGoNgoai' : 'opGo'), x0, y0, t.e, x1, y1, t.e + LC);

    // slab with its openings; floor finish per room on top
    for (const s of f.san ?? []) {
      for (const [x0, y0, x1, y1] of tru(s, f.lo_san ?? [])) {
        const z0 = t.i === 0 ? COT_SAN_VUON : t.e - SAN_DAY;
        const vien = NGOAI(t) === 'kinhMatDung' ? 'kinhMatDung' : 'cotXam';
        X.hop((n, c) => (n[1] < -0.5 ? 'tran' : laMatNgoai(n, c) ? vien : 'tran'), x0, y0, z0, x1, y1, t.e - 10, { canh: 'cau-truc' });
      }
      const daLat = [];
      for (const p of PHONG) {
        if (p.tang !== t.ma) continue;
        const g = giao(p.hcn, s);
        if (!g) continue;
        for (const r of tru(g, [...(f.lo_san ?? []), ...daLat])) X.hop(lopSan(p, t), r[0], r[1], t.e - 10, r[2], r[3], t.e, { canh: false, nap: false });
        daLat.push(g);
      }
    }

    if (f.thang) cauThang(X, f.thang, t);

    // flat ceiling under a sloped roof
    if (t.cao_tran) {
      for (const p of PHONG) {
        if (p.tang !== t.ma || p.loai === 'ngoai_troi') continue;
        const [x0, y0, x1, y1] = p.hcn, z = t.e + t.cao_tran;
        X.hop('tran', x0, y0, z, x1, y1, z + 20, { canh: 'cau-truc', nap: false });
      }
    }
  }

  // warm cove light strips under flat ceilings
  for (const p of PHONG) {
    if (p.loai === 'ngoai' || p.loai === 'ngoai_troi') continue;
    const [x0, y0, x1, y1] = p.hcn, t = TANG.find((k) => k.ma === p.tang);
    const z = dinhTuong(t, (x0 + x1) / 2, (y0 + y1) / 2), a = 280, w = 50;
    if (x1 - x0 < 1500 || y1 - y0 < 1500 || Math.abs(z - p.z[1]) > 5) continue;
    for (const r of [[x0 + a, y0 + a, x1 - a, y0 + a + w], [x0 + a, y1 - a - w, x1 - a, y1 - a], [x0 + a, y0 + a + w, x0 + a + w, y1 - a - w], [x1 - a - w, y0 + a + w, x1 - a, y1 - a - w]]) {
      X.hop('denTran', r[0], r[1], z - 25, r[2], r[3], z - 5, { canh: false, nap: false });
    }
  }

  dungMai(X);
  ngoaiNha(X);
  canhQuan(X);
  return X;
}

function lopSan(p, t) {
  if (p.san) return p.san;
  if (p.loai === 'wc') return 'gach';
  if (p.loai === 'ngoai_troi') return 'gach';
  if (t.i === 0 || p.loai === 'sanh' || p.loai === 'bep') return 'da';
  return 'sanGo';
}

// ---------------------------------------------------------------------------
// roofs
// ---------------------------------------------------------------------------
function dungMai(X) {
  for (const m of MAI) {
    const [x0, y0, x1, y1] = m.hcn, d = m.day;
    if (m.kieu === 'doc') {
      const h = m.huong ?? '+y';
      const [a0, a1] = h.endsWith('y') ? [y0, y1] : [x0, x1];
      const [za, zb] = h.startsWith('+') ? [m.thap, m.cao] : [m.cao, m.thap];
      const prof = [[a0, za - d], [a1, zb - d], [a1, zb], [a0, za]];
      if (h.endsWith('y')) X.lang('ton', 'x', x0, x1, prof, { nap: false });
      else X.lang('ton', 'y', y0, y1, prof, { nap: false });
    } else if (m.kieu === 'hai_doc') {
      const alongX = (m.huong ?? 'x') === 'x'; // ridge runs along x
      const [a0, a1] = alongX ? [y0, y1] : [x0, x1], g = (a0 + a1) / 2;
      for (const [p, q] of [[a0, g], [g, a1]]) {
        const zp = p === a0 ? m.thap : m.cao, zq = q === a1 ? m.thap : m.cao;
        const prof = [[p, zp - d], [q, zq - d], [q, zq], [p, zp]];
        if (alongX) X.lang('ton', 'x', x0, x1, prof, { nap: false });
        else X.lang('ton', 'y', y0, y1, prof, { nap: false });
      }
    } else if (m.kieu === 'bang') {
      X.hop((n) => (n[1] < -0.5 ? 'tran' : m.vat_lieu ?? 'beTong'), x0, y0, m.cao - d, x1, y1, m.cao);
      const h = m.tuong_chan ?? 0, w = 100;
      if (h > 0) for (const r of [[x0, y0, x1, y0 + w], [x0, y1 - w, x1, y1], [x0, y0 + w, x0 + w, y1 - w], [x1 - w, y0 + w, x1, y1 - w]]) X.hop('opGoNgoai', r[0], r[1], m.cao, r[2], r[3], m.cao + h);
    } else if (m.kieu === 'tam_trong') {
      X.hop('poly', x0, y0, m.cao, x1, y1, m.cao + 15, { canh: 'manh', nap: false });
    }
  }
}

// ---------------------------------------------------------------------------
// yard and roof-top items (all optional in the description)
// ---------------------------------------------------------------------------
function ngoaiNha(X) {
  const N = NHA.ngoai_nha ?? {};
  const S = COT_SAN_VUON;
  for (const [x0, y0, x1, y1] of N.san_vuon ?? []) X.hop('beTong', x0, y0, S - 150, x1, y1, S, { nap: false });
  for (const b of N.bac ?? []) X.hop('da', b.hcn[0], b.hcn[1], S, b.hcn[2], b.hcn[3], S + b.cao, { nap: false });
  for (const r of N.rao ?? []) X.hop('thepNau', r.hcn[0], r.hcn[1], S, r.hcn[2], r.hcn[3], S + r.cao);
  for (const c of N.cong ?? []) {
    const [x0, y0, x1, y1] = c.hcn, top = S + c.cao, ray = 60, buoc = 120, nan = 30;
    const doc = x1 - x0 >= y1 - y0;
    X.hop('thepNau', x0, y0, S + 80, x1, y1, S + 80 + ray, { nap: false });
    X.hop('thepNau', x0, y0, top - ray, x1, y1, top, { nap: false });
    if (doc) for (let x = x0; x + nan <= x1; x += buoc) X.hop('thepNau', x, y0, S + 80, x + nan, y1, top, { canh: 'manh', nap: 'muc' });
    else for (let y = y0; y + nan <= y1; y += buoc) X.hop('thepNau', x0, y, S + 80, x1, y + nan, top, { canh: 'manh', nap: 'muc' });
  }
  const P = N.pergola;
  if (P) {
    for (const [x0, y0, x1, y1] of P.cot ?? []) X.hop('thepNau', x0, y0, S, x1, y1, P.cao);
    const dx = P.day_xa ?? 200;
    for (const [x0, y0, x1, y1] of P.xa ?? []) {
      if (x0 === x1) X.hop('thepNau', x0 - 50, y0, P.cao, x0 + 50, y1, P.cao + dx, { nap: false });
      else X.hop('thepNau', x0, y0 - 50, P.cao, x1, y0 + 50, P.cao + dx, { nap: false });
    }
    if (P.mai) X.hop('poly', P.mai[0], P.mai[1], P.cao + dx, P.mai[2], P.mai[3], P.cao + dx + 15, { canh: 'manh', nap: false });
  }
  for (const m of N.may_lanh ?? []) X.hop('trang', m.hcn[0], m.hcn[1], m.dat_tren ?? S, m.hcn[2], m.hcn[3], (m.dat_tren ?? S) + m.cao, { canh: 'noi-that' });
  for (const o of N.ong_xoi ?? []) X.tru('ongXoi', o.x, o.y, o.r ?? 45, S, o.cao_toi, 10);
  for (const b of N.bon_nuoc ?? []) {
    const z = b.dat_tren ?? S, chan = b.chan ?? 300;
    X.hop('inox', b.x - b.r * 0.7, b.y - b.r * 0.7, z, b.x + b.r * 0.7, b.y + b.r * 0.7, z + chan, { canh: 'cau-truc' });
    X.tru('inox', b.x, b.y, b.r, z + chan, z + chan + b.cao, 24);
  }
  for (const k of N.kim_thu_set ?? []) X.tru('inox', k.x, k.y, 12, k.dat_tren ?? S, (k.dat_tren ?? S) + (k.cao ?? 1500), 6);
  for (const c of N.cay ?? []) {
    X.tru('thanCay', c.x, c.y, 110, S, S + 2600, 8);
    X.cau('laNgoai', c.x, c.y, S + 3600, c.r ?? 1700);
    X.cau('laNgoai', c.x + 700, c.y - 300, S + 3000, (c.r ?? 1700) * 0.7);
  }
}

// ---------------------------------------------------------------------------
// doors and windows
// ---------------------------------------------------------------------------
function oCua(X, cua, loai, be, dau) {
  const [x0, y0, x1, y1] = cua.hcn;
  const doc = cua.doc_x ?? x1 - x0 >= y1 - y0; // opening runs along x
  const k = 45, f = 35;
  const box = (a0, a1, z0, z1, mat, opts) => {
    if (doc) { const yc = (y0 + y1) / 2; X.hop(mat, a0, yc - k / 2, z0, a1, yc + k / 2, z1, opts); }
    else { const xc = (x0 + x1) / 2; X.hop(mat, xc - k / 2, a0, z0, xc + k / 2, a1, z1, opts); }
  };
  const a0 = doc ? x0 : y0, a1 = doc ? x1 : y1;
  const fr = { canh: 'noi-that', nap: 'muc' };
  box(a0, a0 + f, be, dau, 'khungNhom', fr);
  box(a1 - f, a1, be, dau, 'khungNhom', fr);
  box(a0, a1, dau - f, dau, 'khungNhom', fr);
  if ((loai.be ?? 0) > 0) box(a0, a1, be, be + f, 'khungNhom', fr);
  const kinh = (b0, b1, z0, z1) => box(b0, b1, z0, z1, 'kinh', { canh: false, nap: false });
  const kieu = loai.kieu ?? 'so';
  if (kieu.startsWith('so')) {
    if (a1 - a0 > 1000) { const m = (a0 + a1) / 2; box(m - f / 2, m + f / 2, be + f, dau - f, 'khungNhom', fr); }
    kinh(a0 + f, a1 - f, be + f, dau - f);
  } else if (kieu === 'kinh_xep') {
    // folding glass leaves stacked at both ends, the middle open
    const w = (a1 - a0) / 4;
    for (const [b0, b1] of [[a0 + f, a0 + w], [a1 - w, a1 - f]]) { box(b1 - f, b1, be, dau - f, 'khungNhom', fr); kinh(b0, b1 - f, be, dau - f); }
  } else if (kieu === 'lua') {
    const m = (a0 + a1) / 2;
    box(m - f, m, be, dau - f, 'khungNhom', fr);
    kinh(a0 + f, m - f, be, dau - f);
  } else {
    // swing doors open at 90 degrees, into the room that is not a hall
    const leafMat = kieu === 'di_kinh_mo' ? 'trang' : 'goToi';
    const day = 40, rong = a1 - a0 - 2 * f;
    const xc = (x0 + x1) / 2, yc = (y0 + y1) / 2;
    const phia = (dx, dy) => { // which side has a room that is not a hall/stair
      const p = PHONG.find((q) => q.loai !== 'ngoai' && xc + dx > q.hcn[0] && xc + dx < q.hcn[2] && yc + dy > q.hcn[1] && yc + dy < q.hcn[3]);
      return p && p.loai !== 'sanh' ? 1 : 0;
    };
    // `mo` on the opening forces the swing side: '+x', '-x', '+y', '-y'
    const ep = { '+x': 1, '-x': -1, '+y': 1, '-y': -1 }[cua.mo];
    if (doc) {
      const ra = ep ?? (phia(0, -300) >= phia(0, 300) ? -1 : 1);
      const yA = ra < 0 ? yc - rong : yc, yB = ra < 0 ? yc : yc + rong;
      X.hop(leafMat, a0 + f, yA, be, a0 + f + day, yB, dau - f, fr);
    } else {
      const ra = ep ?? (phia(300, 0) >= phia(-300, 0) ? 1 : -1);
      const xA = ra > 0 ? xc : xc - rong, xB = ra > 0 ? xc + rong : xc;
      X.hop(leafMat, xA, a0 + f, be, xB, a0 + f + day, dau - f, fr);
    }
  }
}

// ---------------------------------------------------------------------------
// stairs: flights and landings in order, from this floor to `toi`.
// Ground floor stairs are solid; upper ones are a stepped waist slab.
// ---------------------------------------------------------------------------
function cauThang(X, th, t) {
  const den = TANG.find((k) => k.ma === th.toi) ?? TANG[t.i + 1];
  if (!den) return;
  const doan = th.doan ?? [];
  const tong = doan.reduce((s, d) => s + (d.loai === 've' ? d.so_bac : 0), 0) || 1;
  const h = (den.cao_do - t.e) / tong;
  // solid under the flights on the ground floor; `dac: false` for a stair that
  // starts on an upper floor (a tower modelled from floor N)
  const dat = th.dac ?? t.i === 0, waist = 200;
  const mat = (n) => (n[1] < -0.5 ? 'tran' : 'da');
  const o = { nap: false };
  let z = t.e;
  for (const d of doan) {
    const [x0, y0, x1, y1] = d.hcn;
    if (d.loai === 'nghi') { X.hop(mat, x0, y0, dat ? t.e : z - 150, x1, y1, z, o); continue; }
    const n = d.so_bac, len = d.len ?? '+y';
    for (let i = 0; i < n; i++) {
      const top = z + (i + 1) * h, bot = dat ? t.e : Math.max(t.e, top - h - waist);
      if (len === '+x') { const s = (x1 - x0) / n; X.hop(mat, x0 + i * s, y0, bot, x0 + (i + 1) * s, y1, top, o); }
      else if (len === '-x') { const s = (x1 - x0) / n; X.hop(mat, x1 - (i + 1) * s, y0, bot, x1 - i * s, y1, top, o); }
      else if (len === '+y') { const s = (y1 - y0) / n; X.hop(mat, x0, y0 + i * s, bot, x1, y0 + (i + 1) * s, top, o); }
      else { const s = (y1 - y0) / n; X.hop(mat, x0, y1 - (i + 1) * s, bot, x1, y1 - i * s, top, o); }
    }
    z += n * h;
  }
}

// ---------------------------------------------------------------------------
// context around the lot: NOT from the drawing. Plain and pale, lower than the
// house on the left (the camera side), so it never hides the house.
// ---------------------------------------------------------------------------
function canhQuan(X) {
  if (NHA.canh_quan === false) return;
  const o = { canh: 'manh', nap: false };
  const S = COT_SAN_VUON;
  const [lx0, ly0, lx1, ly1] = LO_DAT;
  const sau = ly1 - ly0, cao = Math.max(...TANG.map((t) => t.tren));
  X.hop('beTong', lx0 - 40000, ly0 - 1500, S - 150, lx1 + 40000, ly0, S, { canh: false, nap: false });
  X.hop('nhua', lx0 - 40000, ly0 - 8500, S - 300, lx1 + 40000, ly0 - 1500, S - 150, { canh: false, nap: false });
  X.hop('beTong', lx0 - 40000, ly0 - 10000, S - 150, lx1 + 40000, ly0 - 8500, S, { canh: false, nap: false });
  const nha = (x0, x1, y0, y1, h) => {
    if (h <= 0) return;
    X.hop('nhaBen', x0, y0, S, x1, y1, S + h, o);
    for (let z = S + 1500; z + 1300 < S + h; z += 3400) X.hop('kinhBen', x0 + 900, y0 - 15, z, x1 - 900, y0, z + 1300, { canh: 'manh', nap: false });
  };
  const w = 6000, nhaY0 = NHA_HCN[1];
  nha(lx0 - w, lx0 - 30, nhaY0 + 2000, nhaY0 + sau * 0.75, Math.min(7450, cao * 0.6));
  nha(lx0 - 2 * w, lx0 - w, nhaY0 + 2000, nhaY0 + sau * 0.8, 4050);
  nha(lx1 + 30, lx1 + w, nhaY0, nhaY0 + sau * 0.75, Math.min(10850, cao * 0.85));
  nha(lx1 + w, lx1 + 2 * w, nhaY0, nhaY0 + sau * 0.8, 7450);
  for (let i = -2; i <= 3; i++) nha(lx0 + i * 7000, lx0 + (i + 1) * 7000 - 200, ly0 - 25000, ly0 - 11000, [7450, 10850, 13850][(i + 3) % 3]);
  for (const [x, y] of [[lx0 - 2300, ly0 - 800], [lx1 + 4200, ly0 - 800], [lx0 - 9000, ly0 - 9200], [lx1 + 1000, ly0 - 9200]]) {
    X.tru('thanCay', x, y, 110, S, S + 2600, 8);
    X.cau('laNgoai', x, y, S + 3600, 1700);
    X.cau('laNgoai', x + 700, y - 300, S + 3000, 1200);
    X.cau('laNgoai', x - 600, y + 400, S + 3200, 1250);
  }
}
