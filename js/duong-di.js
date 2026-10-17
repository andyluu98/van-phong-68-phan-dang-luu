// The camera, as a function of scroll progress s (0..1), generated from the house.
//
// Part A, from above (s 0 .. 0.30)
//   the plan sheet seen through a 2 degree lens, the swing to a three-quarter
//   view while the house is raised floor by floor, the outside turning to
//   material, and the descent to the main door.
// Part B, keyframes (s 0.30 .. 1)
//   - on each floor the rooms to visit (NHA.tham_quan, or the largest rooms),
//     each seen from a composed viewpoint, held while you scroll;
//   - walking between them follows a path found on a grid of the floor, so it
//     goes through doors and around furniture, never through walls;
//   - between floors the camera rises out of the room into the plan of the
//     next floor and comes down into it, as in a section drawing;
//   - at the end it pulls back to see the whole house.

import { NHA } from './du-lieu.js';
import { TANG, MB, PHONG, phongTai, NHA_HCN, LO_DAT, DINH, COT_SAN_VUON, dinhTuong } from './cau-hinh.js';
import { loaiNoiThat } from './noi-that.js';

const rad = Math.PI / 180;
const io = (t) => t * t * (3 - 2 * t);
const io5 = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const kep = (t) => Math.min(1, Math.max(0, t));
const MO = 99; // cut far above everything
const MAT = 1600; // eye height above the floor, mm

function track(keys) {
  return (s) => {
    if (s <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      if (s <= keys[i][0]) {
        const t = (s - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0]);
        return keys[i - 1][1] + (keys[i][1] - keys[i - 1][1]) * (keys[i][2] ?? ((x) => x))(t);
      }
    }
    return keys[keys.length - 1][1];
  };
}

export const MOC = { giay: 0.035, nghieng: 0.10, dung: 0.20, phu: 0.245, dat: 0.30 };

// ---------------------------------------------------------------------------
// floor grids: where a person can stand
// ---------------------------------------------------------------------------
const O = 100; // cell size, mm
const BAN_KINH = 260; // clearance from obstacles

export function dungLuoi(t) {
  const dat = t.i === 0;
  const vung = dat ? [Math.min(LO_DAT[0], NHA_HCN[0]), Math.min(LO_DAT[1], NHA_HCN[1]), Math.max(LO_DAT[2], NHA_HCN[2]), Math.max(LO_DAT[3], NHA_HCN[3])] : NHA_HCN;
  const x0 = vung[0] - 200, y0 = vung[1] - 200;
  const nx = Math.ceil((vung[2] - vung[0] + 400) / O), ny = Math.ceil((vung[3] - vung[1] + 400) / O);
  const chan = new Uint8Array(nx * ny); // 1 = blocked
  const f = MB(t.ma);
  const toCells = (r, gian, gtri = 1) => {
    const i0 = Math.max(0, Math.floor((r[0] - gian - x0) / O)), i1 = Math.min(nx - 1, Math.floor((r[2] + gian - x0) / O));
    const j0 = Math.max(0, Math.floor((r[1] - gian - y0) / O)), j1 = Math.min(ny - 1, Math.floor((r[3] + gian - y0) / O));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) chan[j * nx + i] = gtri;
  };
  // walkable area: the floor slabs (and the lot on the ground floor)
  chan.fill(1);
  if (dat) toCells(LO_DAT, -BAN_KINH, 0);
  for (const s of f.san ?? []) toCells(s, -BAN_KINH, 0);
  for (const h of f.lo_san ?? []) toCells(h, BAN_KINH, 1);
  // obstacles
  for (const r of [...(f.tuong ?? []), ...(f.cot ?? []), ...(f.lan_can ?? [])]) toCells(r, BAN_KINH);
  for (const c of f.cua ?? []) if ((NHA.loai_cua?.[c.ma]?.kieu ?? 'so').startsWith('so')) toCells(c.hcn, BAN_KINH);
  for (const d of f.thang?.doan ?? []) toCells(d.hcn, BAN_KINH);
  for (const v of f.noi_that ?? []) if (!v.treo && !['THẢM', 'ĐÈN TRẦN'].includes(loaiNoiThat(v.ten))) toCells(v.hcn, BAN_KINH);
  if (dat) {
    const N = NHA.ngoai_nha ?? {};
    for (const r of N.rao ?? []) toCells(r.hcn, BAN_KINH);
    for (const r of N.cong ?? []) toCells(r.hcn, BAN_KINH);
    for (const r of N.pergola?.cot ?? []) toCells(r, BAN_KINH);
    for (const r of N.may_lanh ?? []) toCells(r.hcn, BAN_KINH);
  }
  const o = (x, y) => [Math.floor((x - x0) / O), Math.floor((y - y0) / O)];
  const tam = (i, j) => [x0 + (i + 0.5) * O, y0 + (j + 0.5) * O];
  const tu = (i, j) => i >= 0 && j >= 0 && i < nx && j < ny && !chan[j * nx + i];
  return { nx, ny, chan, o, tam, tu };
}

// nearest free cell to a plan point
export function ganNhat(L, x, y) {
  const [ci, cj] = L.o(x, y);
  for (let r = 0; r < 60; r++) {
    let best = null, bd = Infinity;
    for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) {
      if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r || !L.tu(i, j)) continue;
      const d = Math.hypot(i - ci, j - cj);
      if (d < bd) { bd = d; best = [i, j]; }
    }
    if (best) return best;
  }
  return null;
}

// A* on the grid, 8 neighbours; returns plan points (mm)
export function timDuong(L, a, b) {
  const A = ganNhat(L, ...a), B = ganNhat(L, ...b);
  if (!A || !B) return null;
  const { nx } = L, key = (i, j) => j * nx + i;
  const g = new Map([[key(...A), 0]]), cha = new Map();
  const mo = [[0, A[0], A[1]]];
  const h = (i, j) => Math.hypot(i - B[0], j - B[1]);
  const dong = new Set();
  while (mo.length) {
    let bi = 0;
    for (let k = 1; k < mo.length; k++) if (mo[k][0] < mo[bi][0]) bi = k;
    const [, i, j] = mo.splice(bi, 1)[0];
    const k0 = key(i, j);
    if (dong.has(k0)) continue;
    dong.add(k0);
    if (i === B[0] && j === B[1]) {
      const out = [];
      let k = k0;
      while (k !== undefined) { out.push(L.tam(k % nx, Math.floor(k / nx))); k = cha.get(k); }
      return out.reverse();
    }
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const ii = i + di, jj = j + dj;
      if (!L.tu(ii, jj) || (di && dj && (!L.tu(i + di, j) || !L.tu(i, j + dj)))) continue;
      const kk = key(ii, jj), gg = g.get(k0) + Math.hypot(di, dj);
      if (gg < (g.get(kk) ?? Infinity)) { g.set(kk, gg); cha.set(kk, k0); mo.push([gg + h(ii, jj), ii, jj]); }
    }
  }
  return null;
}

// keep only the corners a person would walk to (line of sight on the grid)
export function rutGon(L, pts) {
  if (!pts || pts.length < 3) return pts;
  const thay = (a, b) => {
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (O / 2)));
    for (let k = 0; k <= n; k++) {
      const x = a[0] + ((b[0] - a[0]) * k) / n, y = a[1] + ((b[1] - a[1]) * k) / n;
      if (!L.tu(...L.o(x, y))) return false;
    }
    return true;
  };
  const out = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !thay(pts[i], pts[j])) j--;
    out.push(pts[j]);
    i = j;
  }
  return out;
}

// ---------------------------------------------------------------------------
// viewpoints: where to stand in a room and what to look at
// ---------------------------------------------------------------------------
export function diemNhin(L, t, p) {
  const [x0, y0, x1, y1] = p.hcn;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const doDac = (MB(t.ma).noi_that ?? []).filter((v) => {
    const mx = (v.hcn[0] + v.hcn[2]) / 2, my = (v.hcn[1] + v.hcn[3]) / 2;
    return mx > x0 && mx < x1 && my > y0 && my < y1;
  }).map((v) => [(v.hcn[0] + v.hcn[2]) / 2, (v.hcn[1] + v.hcn[3]) / 2]);
  let best = null, bs = -Infinity;
  const inset = 350;
  for (let y = y0 + inset; y <= y1 - inset; y += 200) for (let x = x0 + inset; x <= x1 - inset; x += 200) {
    const [i, j] = L.o(x, y);
    let ok = true; // some room around the camera
    for (let dj = -2; dj <= 2 && ok; dj++) for (let di = -2; di <= 2; di++) if (!L.tu(i + di, j + dj)) { ok = false; break; }
    if (!ok) continue;
    const huong = Math.atan2(cy - y, cx - x);
    let thay = 0;
    for (const [fx, fy] of doDac) {
      const a = Math.atan2(fy - y, fx - x);
      let d = Math.abs(a - huong); if (d > Math.PI) d = 2 * Math.PI - d;
      if (d < 34 * rad && Math.hypot(fx - x, fy - y) > 900) thay++;
    }
    const s = Math.hypot(cx - x, cy - y) / 1000 + 0.9 * thay;
    if (s > bs) { bs = s; best = [x, y]; }
  }
  if (!best) best = [cx, cy];
  return { x: best[0], y: best[1], nhin: [cx, cy] };
}

// yaw (deg) looking from a to b in plan; 0 looks to -Z (= +y in plan), +90 to -X
const yawToi = (a, b) => Math.atan2(-(b[0] - a[0]), b[1] - a[1]) / rad;
const ganYaw = (y, truoc) => { while (y - truoc > 180) y -= 360; while (y - truoc < -180) y += 360; return y; };

// main door: a ground floor door facing the street (smallest y)
function cuaChinh() {
  if (NHA.cua_chinh) return { x: NHA.cua_chinh.x, y: NHA.cua_chinh.y };
  const f = MB(TANG[0].ma);
  const ds = (f.cua ?? []).filter((c) => !(NHA.loai_cua?.[c.ma]?.kieu ?? 'so').startsWith('so'));
  if (!ds.length) return { x: (NHA_HCN[0] + NHA_HCN[2]) / 2, y: NHA_HCN[1] };
  ds.sort((a, b) => a.hcn[1] - b.hcn[1]);
  const c = ds[0].hcn;
  return { x: (c[0] + c[2]) / 2, y: (c[1] + c[3]) / 2 };
}

// rooms to visit, in walking order
function phongThamQuan() {
  const ds = [];
  if (Array.isArray(NHA.tham_quan) && NHA.tham_quan.length) {
    for (const q of NHA.tham_quan) {
      const p = PHONG.find((r) => r.tang === q.tang && r.ten.toUpperCase() === String(q.phong).toUpperCase());
      // optional fixed viewpoint `tu` [x, y] looking at `nhin` [x, y], caption `chu`
      if (p) ds.push(q.tu ? { ...p, tu: q.tu, nhinToi: q.nhin, chu: q.chu } : { ...p, chu: q.chu });
    }
  } else {
    for (const t of TANG) {
      const tot = PHONG.filter((p) => p.tang === t.ma && !['wc', 'sanh', 'kho', 'ngoai'].includes(p.loai))
        .sort((a, b) => (b.hcn[2] - b.hcn[0]) * (b.hcn[3] - b.hcn[1]) - (a.hcn[2] - a.hcn[0]) * (a.hcn[3] - a.hcn[1]));
      ds.push(...tot.slice(0, 2));
    }
  }
  return ds;
}

const capDo = (e) => (e === 0 ? '±0.000' : (e > 0 ? '+' : '') + (e / 1000).toFixed(3));

// ---------------------------------------------------------------------------
export function taoDuongDi(aspect) {
  const doc = aspect < 0.9;
  const fovDi = doc ? 74 : aspect < 1.5 ? 62 : 56;
  const T = (deg) => Math.tan((deg * rad) / 2);
  const L = Math.log;

  const [hx0, hy0, hx1, hy1] = NHA_HCN;
  const hcx = (hx0 + hx1) / 2000, hcz = -(hy0 + hy1) / 2000;
  const sau = Math.max(LO_DAT[3] - LO_DAT[1], hy1 - hy0) / 1000, rong = Math.max(LO_DAT[2] - LO_DAT[0], hx1 - hx0) / 1000;
  const cao = DINH / 1000;

  // ---- part B keyframes ---------------------------------------------------
  const K = [];
  const them = (x, y, z, yaw, pitch, fov, cut, w, cap) => K.push({ x, y, z, yaw, pitch, fov, cut, w, cap });
  const giu = (w = 1.4) => { const a = K[K.length - 1]; them(a.x, a.y, a.z + 0.03, a.yaw, a.pitch, a.fov, a.cut, w); };

  const luoi = TANG.map((t) => dungLuoi(t));
  const thamQuan = phongThamQuan();
  const cuaVao = cuaChinh();
  const t0 = TANG[0];
  const matDat = (x, y, t) => {
    const trong = (MB(t.ma).san ?? []).some((r) => x > r[0] && x < r[2] && y > r[1] && y < r[3]);
    return ((t.i === 0 && !trong) ? COT_SAN_VUON : t.e) + MAT;
  };

  // where the descent lands: in the yard, 3.5 m in front of the main door, at a
  // spot with a clear view of the door (cars and posts in the yard are avoided)
  const L0 = luoi[0];
  // `ra`: which way is outside from the door (default the street side, -y)
  const [rx, ry] = { '-y': [0, -1], '+y': [0, 1], '-x': [-1, 0], '+x': [1, 0] }[NHA.cua_chinh?.ra ?? '-y'];
  const xDat = rx ? Math.min(LO_DAT[2] - 900, Math.max(LO_DAT[0] + 900, cuaVao.x + rx * 3500)) : cuaVao.x;
  const yDat = ry ? Math.min(LO_DAT[3] - 900, Math.max(LO_DAT[1] + 900, cuaVao.y + ry * 3500)) : cuaVao.y;
  const thayCua = (p) => {
    const n = 40;
    for (let k = 0; k < n - 4; k++) {
      const x = p[0] + ((cuaVao.x + rx * 300 - p[0]) * k) / n, y = p[1] + ((cuaVao.y + ry * 300 - p[1]) * k) / n;
      if (!L0.tu(...L0.o(x, y))) return false;
    }
    return true;
  };
  let datXY = null;
  for (let d = 0; d <= 4000 && !datXY; d += 200) {
    for (const s of [1, -1]) {
      const p = [xDat + s * d * Math.abs(ry), yDat + s * d * Math.abs(rx)];
      if (L0.tu(...L0.o(...p)) && thayCua(p)) { datXY = p; break; }
    }
  }
  if (!datXY) { const g0 = ganNhat(L0, xDat, yDat); datXY = g0 ? L0.tam(...g0) : [xDat, yDat]; }
  them(datXY[0] / 1000, matDat(...datXY, t0) / 1000, -datXY[1] / 1000, yawToi(datXY, [cuaVao.x, cuaVao.y]), 0, null, MO, 0, { a: 'Lối vào', b: NHA.ten_cong_trinh ?? '' });

  // walk along a path on a floor
  const diBo = (t, tu, den, nhin) => {
    const Lg = luoi[t.i];
    const duong = (rutGon(Lg, timDuong(Lg, tu, den)) ?? [tu, den]).slice(1);
    let truoc = K[K.length - 1];
    for (let k = 0; k < duong.length; k++) {
      const p = duong[k], sau2 = duong[k + 1] ?? nhin;
      const y = ganYaw(yawToi(p, sau2), truoc.yaw);
      const d = Math.hypot(p[0] / 1000 - truoc.x, -p[1] / 1000 - truoc.z);
      them(p[0] / 1000, matDat(...p, t) / 1000, -p[1] / 1000, y, -4, null, MO, d * 0.8 + Math.abs(y - truoc.yaw) / 70 + 0.3);
      truoc = K[K.length - 1];
    }
  };

  // rise out of a floor, show a plan, optionally come down into another floor
  const caoNhin = (Math.max(sau, rong * (doc ? 1.6 : 0.9)) / (2 * Math.tan(20 * rad))) * 0.95;
  const lenMatBang = (tCu, tMoi, cap) => {
    const a = K[K.length - 1];
    const catCu = tCu.e / 1000 + 1.2, catMoi = tMoi.e / 1000 + 1.2;
    them(a.x, a.y, a.z, a.yaw, a.pitch, a.fov, (dinhTuong(tCu, a.x * 1000, -a.z * 1000) - 30) / 1000, 0.02);
    them(a.x, a.y + 0.2, a.z, a.yaw, -35, null, catCu, 1.4);
    const top = catMoi + caoNhin, yawTop = ganYaw(0, a.yaw);
    them(hcx, top, hcz, yawTop, -90, 40, catCu, 3.2);
    them(hcx, top, hcz, yawTop, -90, 40, catMoi, 1.2, cap);
    giu(1.0);
    return yawTop;
  };
  const xuongPhong = (tMoi, den, yawDen, yawTop) => {
    const catMoi = tMoi.e / 1000 + 1.2;
    const yawCuoi = ganYaw(yawDen, yawTop);
    const xx = den[0] / 1000, zz = -den[1] / 1000, yy = (tMoi.e + MAT) / 1000;
    them(xx * 0.6 + hcx * 0.4, yy + 3.5, zz * 0.6 + hcz * 0.4, (yawTop + yawCuoi) / 2, -60, null, catMoi, 2.4);
    them(xx, yy, zz, yawCuoi, -5, null, (dinhTuong(tMoi, den[0], den[1]) - 60) / 1000, 2.0);
    them(xx, yy, zz + 0.001, yawCuoi, -5, null, MO, 0.02);
  };

  let tHienTai = t0, viTri = datXY;
  // `bat_dau`: the tour starts inside (e.g. a lift lobby on an upper floor):
  // from the street the camera rises to the plan and comes down there
  if (NHA.bat_dau) {
    const b = NHA.bat_dau, t = TANG.find((k) => k.ma === b.tang) ?? t0;
    const yawTop = lenMatBang(tHienTai, t, { a: `Mặt bằng ${t.ten.toLowerCase()}`, b: `Mặt cắt ở cao độ ${capDo(t.e + 1200)}` });
    xuongPhong(t, b.tu, yawToi(b.tu, b.nhin), yawTop);
    K[K.length - 1].cap = { a: b.chu ?? 'Lối vào', b: `${t.ten} · cốt ${capDo(t.e)}` };
    giu(1.6);
    tHienTai = t; viTri = b.tu;
  }
  for (const p of thamQuan) {
    const t = TANG.find((k) => k.ma === p.tang);
    const v = p.tu ? { x: p.tu[0], y: p.tu[1], nhin: p.nhinToi ?? [(p.hcn[0] + p.hcn[2]) / 2, (p.hcn[1] + p.hcn[3]) / 2] } : diemNhin(luoi[t.i], t, p);
    const yawV = yawToi([v.x, v.y], v.nhin);
    const cap = { a: p.chu ?? p.ten, b: `${t.ten} · cốt ${capDo(t.e)}` };
    if (t.ma !== tHienTai.ma) {
      const yawTop = lenMatBang(tHienTai, t, { a: `Mặt bằng ${t.ten.toLowerCase()}`, b: `Mặt cắt ở cao độ ${capDo(t.e + 1200)}` });
      xuongPhong(t, [v.x, v.y], yawV, yawTop);
      tHienTai = t;
      K[K.length - 1].cap = cap;
    } else {
      diBo(t, viTri, [v.x, v.y], v.nhin);
      const a = K[K.length - 1];
      them(v.x / 1000, (t.e + MAT) / 1000, -v.y / 1000, ganYaw(yawV, a.yaw), -6, null, MO, 1.2, cap);
    }
    giu(1.6);
    viTri = [v.x, v.y];
  }

  // the top floor plan, then the whole house
  const tCuoi = TANG[TANG.length - 1];
  if (tCuoi.ma !== tHienTai.ma) {
    lenMatBang(tHienTai, tCuoi, { a: `Mặt bằng ${tCuoi.ten.toLowerCase()}`, b: `Mặt cắt ở cao độ ${capDo(tCuoi.e + 1200)}` });
    const a = K[K.length - 1];
    them(a.x, a.y, a.z, a.yaw, -90, 40, cao + 0.5, 1.6);
  }
  const kc = Math.max(sau, cao * 1.6) * 1.15;
  const dichNhin = [hcx, cao * 0.38, hcz];
  const viTriCuoi = (goc, nang) => [hcx - Math.sin(goc * rad) * kc, cao * 0.38 + kc * Math.tan(nang * rad), hcz + Math.cos(goc * rad) * kc];
  const cuoi1 = viTriCuoi(36, 27), cuoi2 = viTriCuoi(14, 21);
  const yawC = (p) => Math.atan2(-(dichNhin[0] - p[0]), -(dichNhin[2] - p[2])) / rad;
  const pitchC = (p) => Math.atan2(dichNhin[1] - p[1], Math.hypot(dichNhin[0] - p[0], dichNhin[2] - p[2])) / rad;
  const ya = ganYaw(yawC(cuoi1), K[K.length - 1].yaw);
  them(...cuoi1, ya, pitchC(cuoi1), 40, MO, 7, { a: NHA.ten_cong_trinh ?? 'Toàn cảnh', b: NHA.don_vi ?? '' });
  them(...cuoi2, ganYaw(yawC(cuoi2), ya), pitchC(cuoi2), 40, MO, 6);
  giu(1.2);

  // weights -> s
  const tong = K.reduce((s, k) => s + k.w, 0) || 1;
  let acc = 0;
  const S0 = MOC.dat;
  const KHUNG = K.map((k) => { acc += k.w; return [S0 + (1 - S0) * (acc / tong), k.x, k.y, k.z, k.yaw, k.pitch, k.fov, k.cut, k.cap]; });
  KHUNG[0][0] = S0;

  // ---- part A ----------------------------------------------------------
  const F0 = Math.max(sau * 1.35, rong * (doc ? 2.4 : 0.9));
  const cnY = (LO_DAT[1] + LO_DAT[3]) / 2000;
  const cn = doc ? cnY + 0.13 * F0 : cnY;
  const cx = doc ? (LO_DAT[0] + LO_DAT[2]) / 2000 : (LO_DAT[0] + LO_DAT[2]) / 2000 - 0.2 * (F0 * aspect);
  const { giay: s1, nghieng: s2, dung: s3, phu: s4, dat: s5 } = MOC;
  const D0 = KHUNG[0];
  const XA_DAT = 4;
  const som = (t) => 0.5 * io(t) + 0.5 * (1 - (1 - t) * (1 - t));
  const khTilt = Math.max(sau, cao * 1.3) * 1.25;
  const goc = track([[0, 90], [s1, 90], [s2, 40, som], [s3, 34, io], [s4, 24, io], [s5, -D0[5], io]]);
  const huong = track([[0, 0], [s1, 0], [s2, -32, io], [s3, -20, io], [s4, -10, io], [s5, D0[4], io]]);
  const fovL = track([[0, L(T(2))], [s1, L(T(2))], [s2, L(T(32)), io5], [s4, L(T(34)), io], [s5, L(T(fovDi)), io]]);
  const khL = track([[0, L(F0)], [s1, L(F0)], [s2, L(khTilt * (doc ? 1.3 : 1)), io5], [s3, L(khTilt * (doc ? 1.35 : 1.06)), io], [s4, L(khTilt * 0.85), io], [s5, L(2 * XA_DAT * T(fovDi)), io5]]);
  const fx5 = -Math.sin(D0[4] * rad), fz5 = -Math.cos(D0[4] * rad);
  const tx = track([[0, cx], [s1, cx], [s2, hcx, io], [s5, D0[1] + fx5 * XA_DAT, io]]);
  const ty = track([[0, 0], [s1, 0], [s2, cao * 0.22, io], [s3, cao * 0.42, io], [s4, cao * 0.25, io], [s5, D0[2], io]]);
  const tz = track([[0, -cn], [s1, -cn], [s2, hcz, io], [s3, hcz, io], [s4, hcz * 0.5 + D0[3] * 0.5, io], [s5, D0[3] + fz5 * XA_DAT, io]]);
  // walls rise floor by floor, with a beat at each slab
  const catKeys = [[0, 1.2], [s2 + 0.005, 1.2]];
  const buoc = (s3 - 0.01 - (s2 + 0.005)) / TANG.length;
  TANG.forEach((t, i) => catKeys.push([s2 + 0.005 + (i + 1) * buoc, i === TANG.length - 1 ? cao + 0.5 : TANG[i + 1].e / 1000, io]));
  const cat = track(catKeys);

  function phanA(s) {
    const o = {};
    const e = goc(s) * rad, y = huong(s) * rad, th = Math.exp(fovL(s)), xa = Math.exp(khL(s)) / (2 * th);
    o.fov = (2 * Math.atan(th)) / rad;
    o.pitch = -e;
    o.yaw = y;
    const fx = -Math.sin(y) * Math.cos(-e), fy = Math.sin(-e), fz = -Math.cos(y) * Math.cos(-e);
    o.x = tx(s) - fx * xa; o.y = ty(s) - fy * xa; o.z = tz(s) - fz * xa;
    o.xa = xa;
    o.cat = cat(s);
    return o;
  }

  function phanB(s) {
    let i = 0;
    while (i < KHUNG.length - 2 && s > KHUNG[i + 1][0]) i++;
    const a = KHUNG[i], b = KHUNG[i + 1] ?? a;
    const t = io(kep((s - a[0]) / (b[0] - a[0] || 1)));
    const lerp = (k) => a[k] + (b[k] - a[k]) * t;
    const fa = a[6] ?? fovDi, fb = b[6] ?? fovDi;
    const o = { x: lerp(1), y: lerp(2), z: lerp(3), yaw: lerp(4) * rad, pitch: lerp(5) * rad, fov: fa + (fb - fa) * t };
    if (a[7] >= MO && b[7] >= MO) o.cat = MO;
    else if (a[7] >= MO) o.cat = b[7];
    else o.cat = a[7] + (Math.min(b[7], cao + 1) - a[7]) * t;
    o.xa = o.y > cao ? 30 : 5;
    return o;
  }

  function tai(sVao) {
    const s = kep(sVao);
    const o = s <= s5 ? phanA(s) : phanB(s);
    o.s = s;
    o.near = o.xa > 60 ? Math.max(0.1, (o.xa - 60) * 0.9) : 0.05;
    o.far = o.xa > 60 ? o.xa + 600 : 900;
    return o;
  }

  const moc = KHUNG.filter((k) => k[8]).map((k) => ({ s: k[0], cap: k[8] }));
  const het = KHUNG[Math.max(0, KHUNG.length - 4)][0];

  // ---- when each room turns from drawing into material ------------------
  const lich = PHONG.map(() => null);
  const N = 3000;
  for (let k = 0; k <= N; k++) {
    const s = s5 + ((1 - s5) * k) / N;
    const o = tai(s);
    if (o.y > cao || o.pitch < -0.9) continue; // views from above reveal nothing
    const trong = phongTai(o.x, o.y - 1.2, o.z);
    if (lich[trong] === null) lich[trong] = s;
    PHONG.forEach((p, i) => {
      if (lich[i] !== null || p.loai === 'ngoai') return;
      const zFoot = (o.y - 1.5) * 1000;
      if (zFoot < p.z[0] - 200 || zFoot > p.z[1]) return;
      const x = o.x * 1000, y = -o.z * 1000;
      const dx = Math.max(p.hcn[0] - x, 0, x - p.hcn[2]), dy = Math.max(p.hcn[1] - y, 0, y - p.hcn[3]);
      if (Math.hypot(dx, dy) < 3000) lich[i] = s + 0.01;
    });
  }
  const iNgoai = PHONG.length - 1;
  lich[iNgoai] = s3;
  lich.forEach((b, i) => { if (b === null) lich[i] = het + 0.003 * i; });
  const loRa = (s) => lich.map((b, i) => (b === null ? 0 : kep((s - b) / (i === iNgoai ? s4 - s3 : 0.02))));

  return { tai, doc, fovDi, moc, loRa, lich, het, KHUNG };
}
