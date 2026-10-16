// Furniture built from the plan footprints (noi_that in the drawing data).
// The drawing gives each piece's footprint, name and which side its back is
// on; heights, shapes and finishes are ours, chosen for a modern interior.
//
// Plan mm in, world metres out (X = x, Y = z, Z = -y).

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { TANG, MB, COT_SAN_VUON } from './cau-hinh.js';

const C = { SAN: COT_SAN_VUON };
const GOC_CANH = 32; // degrees: crease angle for ink edges

// names people write on drawings -> the builder for that piece
const BO_DAU = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toUpperCase().trim();
const DONG_NGHIA = [
  [/BAN VAN PHONG|WORKSTATION/, 'BÀN VĂN PHÒNG'], [/GHE VAN PHONG|GHE XOAY|OFFICE CHAIR/, 'GHẾ VĂN PHÒNG'],
  [/DEN TRAN|CEILING LIGHT/, 'ĐÈN TRẦN'], [/OP TUONG|OP GO|WALL PANEL/, 'ỐP TƯỜNG'],
  [/SOFA|SALON|GHE DAI/, 'SOFA'], [/BAN TRA|COFFEE/, 'BÀN TRÀ'], [/KE TV|TU TV|\bTV\b/, 'KỆ TV'], [/THAM|RUG|CARPET/, 'THẢM'],
  [/BAN AN|DINING/, 'BÀN ĂN'], [/GHE|CHAIR|STOOL/, 'GHẾ'], [/TU BEP TREN|WALL CAB/, 'TỦ BẾP TRÊN'], [/TU BEP|KITCHEN|COUNTER/, 'TỦ BẾP DƯỚI'],
  [/TU LANH|FRIDGE|REFRIG/, 'TỦ LẠNH'], [/LAVABO|CHAU RUA|BASIN|SINK/, 'LAVABO'], [/SEN|SHOWER/, 'SEN TẮM'], [/BON CAU|TOILET/, 'BỒN CẦU'],
  [/GIUONG DON|SINGLE/, 'GIƯỜNG ĐƠN'], [/GIUONG|BED/, 'GIƯỜNG ĐÔI'], [/\bTAB\b|TAP DAU|NIGHT/, 'TAB'], [/TU AO|TU QUAN AO|WARDROBE|CLOSET/, 'TỦ ÁO'],
  [/TRANG DIEM|DRESSING/, 'BÀN TRANG ĐIỂM'], [/BAN HOC|STUDY/, 'BÀN HỌC'], [/BAN LAM VIEC|DESK/, 'BÀN LÀM VIỆC'], [/BAN NHO|BAN TRON|SIDE TABLE/, 'BÀN NHỎ'],
  [/KE SACH|BOOK/, 'KỆ SÁCH'], [/BAN THO|ALTAR/, 'BÀN THỜ'], [/MAY GIAT|WASH/, 'MÁY GIẶT'], [/GIAN PHOI/, 'GIÀN PHƠI'],
  [/O TO|XE HOI|\bCAR\b/, 'Ô TÔ'], [/CHAU CAY|CAY|PLANT/, 'CHẬU CÂY'],
];
export function loaiNoiThat(ten) {
  const s = BO_DAU(ten ?? '');
  for (const [re, k] of DONG_NGHIA) if (re.test(s)) return k;
  return null;
}

export function dungNoiThat(M) {
  const nhom = new THREE.Group();
  const net = []; // { pos: number[], diem: [x, y, z] }
  const matBang = []; // plan-only outlines: [x0, y0, x1, y1, z]
  let hienTai = null;

  const them = (geo, mat, px, py, pz, { canh = true, bong = true } = {}) => {
    const m = new THREE.Mesh(geo, M[mat]);
    m.position.set(px, py, pz);
    m.castShadow = bong;
    m.receiveShadow = true;
    nhom.add(m);
    if (canh && hienTai) {
      m.updateMatrix();
      const e = new THREE.EdgesGeometry(geo, GOC_CANH).applyMatrix4(m.matrix);
      hienTai.pos.push(...e.attributes.position.array);
      e.dispose();
    }
    return m;
  };
  // box in plan mm, optional rounding radius (mm)
  const hop = (mat, x0, y0, z0, x1, y1, z1, r = 0, o) => {
    const w = (x1 - x0) / 1000, h = (z1 - z0) / 1000, d = (y1 - y0) / 1000;
    const rr = Math.min(r / 1000, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
    const g = rr > 0.002 ? new RoundedBoxGeometry(w, h, d, 3, rr) : new THREE.BoxGeometry(w, h, d);
    return them(g, mat, (x0 + x1) / 2000, (z0 + z1) / 2000, -(y0 + y1) / 2000, o);
  };
  const tru = (mat, x, y, z0, z1, r0, r1 = r0, seg = 24, o) => {
    const g = new THREE.CylinderGeometry(r1 / 1000, r0 / 1000, (z1 - z0) / 1000, seg);
    return them(g, mat, x / 1000, (z0 + z1) / 2000, -y / 1000, o);
  };
  const cau = (mat, x, y, z, r, sy = 1, o) => {
    const g = new THREE.SphereGeometry(r / 1000, 20, 14);
    g.scale(1, sy, 1);
    return them(g, mat, x / 1000, z / 1000, -y / 1000, o);
  };

  // the side a piece has its back on, as a strip of the footprint
  const dai = (x0, y0, x1, y1, lung, t) => ({
    T: [x0, y0, x0 + t, y1], P: [x1 - t, y0, x1, y1], S: [x0, y1 - t, x1, y1], D: [x0, y0, x1, y0 + t],
  })[lung] ?? null;
  const tru4 = (x0, y0, x1, y1, a) => [[x0 + a, y0 + a], [x1 - a, y0 + a], [x0 + a, y1 - a], [x1 - a, y1 - a]];

  const MON = {
    'SOFA': (x0, y0, x1, y1, e, lung) => {
      const t = 200, ngang = lung === 'T' || lung === 'P';
      hop('vaiSang', x0, y0, e + 60, x1, y1, e + 260, 40); // base
      const b = dai(x0, y0, x1, y1, lung, t);
      hop('vaiSang', ...b.slice(0, 2), e + 260, ...b.slice(2), e + 780, 70); // backrest
      // seat cushions
      const [s0, s1] = ngang ? [y0, y1] : [x0, x1];
      const n = Math.max(2, Math.round((s1 - s0) / 900));
      for (let i = 0; i < n; i++) {
        const a = s0 + 40 + (i * (s1 - s0 - 80)) / n, c = s0 + 40 + ((i + 1) * (s1 - s0 - 80)) / n - 20;
        if (ngang) hop('vaiSang', lung === 'T' ? x0 + t : x0 + 40, a, e + 260, lung === 'T' ? x1 - 40 : x1 - t, c, e + 430, 60);
        else hop('vaiSang', a, lung === 'D' ? y0 + t : y0 + 40, e + 260, c, lung === 'D' ? y1 - 40 : y1 - t, e + 430, 60);
      }
      // throw pillows against the back
      const goi = ['datNung', 'oliu', 'cat'];
      for (let i = 0; i < 3; i++) {
        const m = s0 + ((i + 1) * (s1 - s0)) / 4;
        if (ngang) { const xx = lung === 'T' ? x0 + t + 110 : x1 - t - 110; hop(goi[i], xx - 70, m - 200, e + 430, xx + 70, m + 200, e + 820, 70); }
        else { const yy = lung === 'D' ? y0 + t + 110 : y1 - t - 110; hop(goi[i], m - 200, yy - 70, e + 430, m + 200, yy + 70, e + 820, 70); }
      }
      for (const [x, y] of tru4(x0, y0, x1, y1, 60)) tru('denKim', x, y, e, e + 60, 18);
    },
    'BÀN TRÀ': (x0, y0, x1, y1, e) => {
      hop('da', x0, y0, e + 330, x1, y1, e + 380, 20);
      hop('da', x0 + 120, y0 + 120, e, x1 - 120, y1 - 120, e + 330, 10);
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      tru('gomDen', cx - 80, cy, e + 380, e + 600, 60, 40);
      hop('sachA', cx + 60, cy - 150, e + 380, cx + 300, cy + 20, e + 430, 4);
      hop('sachB', cx + 70, cy - 140, e + 430, cx + 280, cy + 10, e + 460, 4);
    },
    'KỆ TV': (x0, y0, x1, y1, e, lung) => {
      hop('oc', x0, y0, e + 120, x1, y1, e + 480, 15);
      for (const [x, y] of tru4(x0, y0, x1, y1, 40)) tru('denKim', x, y, e, e + 120, 12);
      // screen on the wall behind
      const b = dai(x0, y0, x1, y1, lung, 40);
      const ngang = lung === 'T' || lung === 'P';
      const m = ngang ? (y0 + y1) / 2 : (x0 + x1) / 2, nua = 680;
      if (ngang) hop('manHinh', b[0], m - nua, e + 900, b[2], m + nua, e + 1700, 6);
      else hop('manHinh', m - nua, b[1], e + 900, m + nua, b[3], e + 1700, 6);
    },
    'THẢM': (x0, y0, x1, y1, e) => hop('tham', x0, y0, e, x1, y1, e + 12, 4, { bong: false }),
    'BÀN ĂN': (x0, y0, x1, y1, e) => {
      hop('goSoi', x0, y0, e + 720, x1, y1, e + 760, 10);
      for (const [x, y] of tru4(x0, y0, x1, y1, 90)) hop('goSoi', x - 25, y - 25, e, x + 25, y + 25, e + 720, 6);
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      tru('gom', cx, cy, e + 760, e + 1000, 70, 45);
      // two pendant globes over the table
      for (const k of [-1, 1]) {
        const py = cy + k * (y1 - y0) / 4;
        tru('denKim', cx, py, e + 1600, e + 3480, 4, 4, 6, { canh: false });
        cau('denSang', cx, py, e + 1520, 140, 1, { bong: false });
      }
    },
    'GHẾ': (x0, y0, x1, y1, e, lung) => {
      hop('oc', x0, y0, e + 420, x1, y1, e + 460, 15);
      hop('vaiToi', x0 + 20, y0 + 20, e + 460, x1 - 20, y1 - 20, e + 500, 20);
      for (const [x, y] of tru4(x0, y0, x1, y1, 30)) tru('denKim', x, y, e, e + 420, 12);
      const b = lung ? dai(x0, y0, x1, y1, lung, 40) : null;
      if (b) hop('oc', b[0], b[1], e + 500, b[2], b[3], e + 880, 15);
    },
    'TỦ BẾP DƯỚI': (x0, y0, x1, y1, e, lung) => {
      hop('trangMo', x0, y0, e + 100, x1, y1, e + 860, 8);
      hop('denKim', x0 + 30, y0 + 30, e, x1 - 30, y1 - 30, e + 100, 0);
      hop('da', x0, y0, e + 860, x1, y1, e + 900, 6);
      // door seams on the front face, every 600 mm
      const truoc = { S: y0, D: y1, T: x1, P: x0 }[lung];
      for (let x = x0 + 600; x < x1 - 100; x += 600) {
        if (lung === 'S' || lung === 'D') hop('denKim', x - 3, truoc - 4, e + 120, x + 3, truoc + 4, e + 840, 0, { canh: false });
      }
      const cx = (x0 + x1) / 2;
      if (lung === 'S' || lung === 'D') hop('kimLoai', cx - 350, y0 + 120, e + 860, cx + 350, y1 - 120, e + 905, 30); // sink
    },
    'TỦ BẾP TRÊN': (x0, y0, x1, y1, e) => {
      hop('trangMo', x0, y0, e + 1500, x1, y1, e + 2250, 8);
      for (let x = x0 + 500; x < x1 - 100; x += 500) hop('denKim', x - 3, y0 - 4, e + 1520, x + 3, y0 + 2, e + 2230, 0, { canh: false });
      hop('denSang', x0 + 50, y0 + 20, e + 1480, x1 - 50, y0 + 80, e + 1500, 0, { canh: false, bong: false });
    },
    'TỦ LẠNH': (x0, y0, x1, y1, e) => {
      hop('kimLoai', x0 + 20, y0 + 20, e, x1 - 20, y1 - 20, e + 1850, 30);
    },
    'LAVABO': (x0, y0, x1, y1, e, lung, v) => {
      hop(v?.vat_lieu ?? 'oc', x0, y0, e + 450, x1, y1, e + 820, 10);
      hop('gom', x0 + 60, y0 + 60, e + 820, x1 - 60, y1 - 60, e + 900, 40);
      const b = dai(x0, y0, x1, y1, lung, 20);
      if (b) hop('guong', b[0], b[1], e + 1050, b[2], b[3], e + 1800, 6);
    },
    'SEN TẮM': (x0, y0, x1, y1, e) => {
      hop('da', x0, y0, e, x1, y1, e + 40, 4, { bong: false });
      hop('kinh', x1 - 10, y0, e + 40, x1, y1, e + 2000, 0);
      tru('kimLoai', (x0 + x1) / 2, y1 - 120, e + 2000, e + 2020, 110);
    },
    'BỒN CẦU': (x0, y0, x1, y1, e, lung) => {
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      cau('gom', cx, cy - 40, e + 260, 190, 0.75);
      tru('gom', cx, cy - 40, e, e + 260, 150, 170);
      const b = dai(x0, y0, x1, y1, lung, 170);
      if (b) hop('gom', b[0] + 20, b[1], e + 300, b[2] - 20, b[3], e + 760, 40);
    },
    'GIƯỜNG ĐÔI': (x0, y0, x1, y1, e, lung) => giuong(x0, y0, x1, y1, e, lung, 2),
    'GIƯỜNG ĐƠN': (x0, y0, x1, y1, e, lung) => giuong(x0, y0, x1, y1, e, lung, 1),
    'TAB': (x0, y0, x1, y1, e) => {
      hop('oc', x0, y0, e + 120, x1, y1, e + 500, 15);
      for (const [x, y] of tru4(x0, y0, x1, y1, 40)) tru('denKim', x, y, e, e + 120, 10);
      den((x0 + x1) / 2, (y0 + y1) / 2, e + 500);
    },
    'TỦ ÁO': (x0, y0, x1, y1, e, lung) => {
      hop('goSoi', x0, y0, e, x1, y1, e + 2400, 8);
      const truoc = { S: y0, D: y1, T: x1, P: x0 }[lung];
      const ngang = lung === 'S' || lung === 'D';
      const [a, b] = ngang ? [x0, x1] : [y0, y1];
      for (let v = a + 500; v < b - 100; v += 500) {
        if (ngang) hop('denKim', v - 3, truoc - 4, e + 40, v + 3, truoc + 4, e + 2360, 0, { canh: false });
        else hop('denKim', truoc - 4, v - 3, e + 40, truoc + 4, v + 3, e + 2360, 0, { canh: false });
      }
    },
    'BÀN TRANG ĐIỂM': (x0, y0, x1, y1, e, lung) => {
      ban(x0, y0, x1, y1, e, 'goSoi');
      const b = dai(x0, y0, x1, y1, lung, 20);
      if (b) hop('guong', b[0], b[1], e + 900, b[2], b[3], e + 1700, 6);
    },
    'BÀN NHỎ': (x0, y0, x1, y1, e) => {
      tru('da', (x0 + x1) / 2, (y0 + y1) / 2, e + 680, e + 710, (x1 - x0) / 2);
      tru('denKim', (x0 + x1) / 2, (y0 + y1) / 2, e, e + 680, 25);
    },
    'BÀN HỌC': (x0, y0, x1, y1, e) => { ban(x0, y0, x1, y1, e, 'goSoi'); den(x0 + 150, (y0 + y1) / 2, e + 750); },
    'BÀN LÀM VIỆC': (x0, y0, x1, y1, e) => { ban(x0, y0, x1, y1, e, 'oc'); den(x1 - 150, (y0 + y1) / 2, e + 750); },
    'KỆ SÁCH': (x0, y0, x1, y1, e) => {
      hop('oc', x0, y0, e, x1, y1, e + 40, 0);
      hop('oc', x0, y0, e + 1960, x1, y1, e + 2000, 0);
      hop('oc', x0, y0, e, x0 + 30, y1, e + 2000, 0);
      hop('oc', x1 - 30, y0, e, x1, y1, e + 2000, 0);
      hop('oc', x0, y1 - 20, e, x1, y1, e + 2000, 0, { canh: false });
      const mau = ['sachA', 'sachB', 'sachC', 'cat'];
      let k = 0;
      for (let z = e + 40; z < e + 1900; z += 480) {
        hop('oc', x0, y0, z, x1, y1, z + 25, 0, { canh: false });
        for (let x = x0 + 50; x < x1 - 120; x += 60 + ((k * 37) % 50)) {
          const h = 220 + ((k * 53) % 120);
          hop(mau[k % mau.length], x, y0 + 60, z + 25, x + 40 + ((k * 13) % 25), y1 - 40, z + 25 + h, 0, { canh: false });
          k++;
        }
      }
    },
    'BÀN THỜ': (x0, y0, x1, y1, e) => {
      hop('oc', x0, y0, e + 150, x1, y1, e + 1100, 10);
      hop('oc', x0 + 40, y0 + 40, e, x1 - 40, y1 - 40, e + 150, 0);
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      tru('dong', cx, cy, e + 1100, e + 1260, 110, 80);
      for (const k of [-1, 1]) tru('dong', cx + k * 420, cy, e + 1100, e + 1420, 45, 30);
      hop('khungAnh', cx - 200, y1 - 60, e + 1100, cx + 200, y1 - 30, e + 1600, 6);
    },
    'MÁY GIẶT': (x0, y0, x1, y1, e) => {
      hop('trangMo', x0, y0, e, x1, y1, e + 850, 30);
      tru('kinhToi', (x0 + x1) / 2, y0 - 2, e + 380, e + 381, 180);
    },
    'GIÀN PHƠI': (x0, y0, x1, y1, e) => {
      for (const x of [x0, x1 - 30]) hop('kimLoai', x, y0, e, x + 30, y0 + 30, e + 1600, 0);
      for (let y = y0 + 80; y < y1; y += 120) hop('kimLoai', x0, y, e + 1570, x1, y + 12, e + 1582, 0, { canh: false });
    },
    'Ô TÔ': (x0, y0, x1, y1) => {
      const z = C.SAN, w = x1 - x0, d = y1 - y0;
      hop('xe', x0 + 20, y0, z + 250, x1 - 20, y1, z + 820, 90);
      hop('kinhXe', x0 + w * 0.12, y0 + d * 0.32, z + 800, x1 - w * 0.12, y1 - d * 0.2, z + 1380, 110);
      hop('xe', x0 + w * 0.14, y0 + d * 0.34, z + 1360, x1 - w * 0.14, y1 - d * 0.22, z + 1430, 40); // roof
      for (const [x, y] of [[x0 + 120, y0 + d * 0.2], [x1 - 120, y0 + d * 0.2], [x0 + 120, y1 - d * 0.2], [x1 - 120, y1 - d * 0.2]]) {
        const g = new THREE.CylinderGeometry(0.33, 0.33, 0.22, 24);
        g.rotateZ(Math.PI / 2);
        them(g, 'lop', x / 1000, (z + 330) / 1000, -y / 1000);
      }
    },
    'CHẬU CÂY': (x0, y0, x1, y1, e) => cay((x0 + x1) / 2, (y0 + y1) / 2, e, (x1 - x0) / 2),
    // office desk: `lung` is the side the user sits on; monitor and a low
    // fabric screen sit on the far edge
    'BÀN VĂN PHÒNG': (x0, y0, x1, y1, e, lung = 'D') => {
      hop('trangMo', x0, y0, e + 710, x1, y1, e + 740, 6);
      for (const [x, y] of tru4(x0, y0, x1, y1, 40)) hop('denKim', x - 15, y - 15, e, x + 15, y + 15, e + 710, 0);
      const ngang = lung === 'T' || lung === 'P';
      const xa = { D: y1, S: y0, T: x1, P: x0 }[lung], vao = { D: -1, S: 1, T: -1, P: 1 }[lung];
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      if (!ngang) {
        hop('vaiKem', x0, Math.min(xa, xa + vao * 30), e + 740, x1, Math.max(xa, xa + vao * 30), e + 1150, 4);
        const my = xa + vao * 200;
        hop('manHinh', cx - 300, my - 12, e + 860, cx + 300, my + 12, e + 1210, 4);
        hop('denKim', cx - 20, my - 10 + vao * 30, e + 740, cx + 20, my + 10 + vao * 30, e + 860, 0);
        hop('denKim', cx - 120, my - 80, e + 740, cx + 120, my + 80, e + 752, 0);
        hop('gomDen', cx - 230, my + vao * 280 - 80, e + 740, cx + 230, my + vao * 280 + 80, e + 760, 4);
      } else {
        hop('vaiKem', Math.min(xa, xa + vao * 30), y0, e + 740, Math.max(xa, xa + vao * 30), y1, e + 1150, 4);
        const mx = xa + vao * 200;
        hop('manHinh', mx - 12, cy - 300, e + 860, mx + 12, cy + 300, e + 1210, 4);
        hop('denKim', mx - 10 + vao * 30, cy - 20, e + 740, mx + 10 + vao * 30, cy + 20, e + 860, 0);
        hop('denKim', mx - 80, cy - 120, e + 740, mx + 80, cy + 120, e + 752, 0);
        hop('gomDen', mx + vao * 280 - 80, cy - 230, e + 740, mx + vao * 280 + 80, cy + 230, e + 760, 4);
      }
    },
    'GHẾ VĂN PHÒNG': (x0, y0, x1, y1, e, lung) => {
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, r = Math.min(x1 - x0, y1 - y0) / 2;
      for (let k = 0; k < 5; k++) {
        const a = (k * 2 * Math.PI) / 5, dx = Math.cos(a) * r * 0.85, dy = Math.sin(a) * r * 0.85;
        hop('denKim', Math.min(cx, cx + dx) - 15, Math.min(cy, cy + dy) - 15, e + 50, Math.max(cx, cx + dx) + 15, Math.max(cy, cy + dy) + 15, e + 80, 0);
        tru('denKim', cx + dx, cy + dy, e, e + 50, 22);
      }
      tru('kimLoai', cx, cy, e + 80, e + 430, 22);
      hop('vaiToi', cx - r * 0.9, cy - r * 0.9, e + 430, cx + r * 0.9, cy + r * 0.9, e + 500, 30);
      const b = lung ? dai(cx - r * 0.85, cy - r * 0.85, cx + r * 0.85, cy + r * 0.85, lung, 60) : null;
      if (b) hop('vaiToi', b[0], b[1], e + 560, b[2], b[3], e + 1020, 25);
    },
    'ĐÈN TRẦN': (x0, y0, x1, y1, e, lung, v) => {
      const z = e + (v?.cao ?? 2750);
      hop('denKim', x0 - 15, y0 - 15, z - 45, x1 + 15, y1 + 15, z, 0, { canh: false });
      hop('denTran', x0, y0, z - 50, x1, y1, z - 40, 0, { canh: false, bong: false });
    },
    'ỐP TƯỜNG': (x0, y0, x1, y1, e, lung, v) => {
      // `vat_lieu` (default opGo), `ron` joint spacing (default 600, 0 = none),
      // `vat_lieu_ron` joint material (default denKim), `cach_san` lifts the panel off the floor
      const ngang = x1 - x0 >= y1 - y0, z0 = e + (v?.cach_san ?? 0), z1 = e + (v?.cao ?? 2700);
      hop(v?.vat_lieu ?? 'opGo', x0, y0, z0, x1, y1, z1, 0);
      const [a0, a1] = ngang ? [x0, x1] : [y0, y1];
      const buoc = v?.ron ?? 600, mr = v?.vat_lieu_ron ?? 'denKim';
      if (buoc > 0) for (let a = a0 + buoc; a < a1 - 60; a += buoc) {
        if (ngang) hop(mr, a - 4, y0 - 2, z0, a + 4, y1 + 2, z1, 0, { canh: false });
        else hop(mr, x0 - 2, a - 4, z0, x1 + 2, a + 4, z1, 0, { canh: false });
      }
    },
  };

  function ban(x0, y0, x1, y1, e, mat) {
    hop(mat, x0, y0, e + 710, x1, y1, e + 750, 8);
    for (const [x, y] of tru4(x0, y0, x1, y1, 40)) hop('denKim', x - 15, y - 15, e, x + 15, y + 15, e + 710, 0);
  }
  function den(x, y, z) {
    tru('denKim', x, y, z, z + 380, 55, 8);
    tru('denSang', x, y, z + 380, z + 600, 150, 100, 24, { bong: false });
  }
  function cay(x, y, z, r) {
    tru('chau', x, y, z, z + 480, r * 0.75, r * 0.95);
    tru('dat', x, y, z + 470, z + 480, r * 0.9, r * 0.9, 16, { canh: false });
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, rr = r * (0.35 + (i % 3) * 0.12);
      cau('la', x + Math.cos(a) * rr, y + Math.sin(a) * rr, z + 700 + (i % 3) * 180, r * (0.9 + (i % 2) * 0.25), 1.2, { canh: i % 2 === 0 });
    }
    cau('la', x, y, z + 1050, r * 1.05, 1.3);
  }
  function giuong(x0, y0, x1, y1, e, lung, nguoi) {
    hop('oc', x0, y0, e + 80, x1, y1, e + 300, 20);
    hop('denKim', x0 + 60, y0 + 60, e, x1 - 60, y1 - 60, e + 80, 0);
    const b = dai(x0, y0, x1, y1, lung, 80);
    hop('vaiToi', b[0], b[1], e + 300, b[2], b[3], e + 1150, 30); // upholstered headboard
    const m = (k) => ({ T: [x0 + 80, y0 + 20, x1 - 20, y1 - 20], P: [x0 + 20, y0 + 20, x1 - 80, y1 - 20], S: [x0 + 20, y0 + 20, x1 - 20, y1 - 80], D: [x0 + 20, y0 + 80, x1 - 20, y1 - 20] })[k];
    const [a0, b0, a1, b1] = m(lung);
    hop('vaiTrang', a0, b0, e + 300, a1, b1, e + 520, 60); // mattress
    // duvet over the foot two thirds
    const ngang = lung === 'T' || lung === 'P';
    const dauGiuong = { T: a0, P: a1, S: b1, D: b0 }[lung];
    const chan = ngang ? (lung === 'T' ? [a0 + (a1 - a0) * 0.32, b0 - 15, a1 + 15, b1 + 15] : [a0 - 15, b0 - 15, a1 - (a1 - a0) * 0.32, b1 + 15])
      : (lung === 'S' ? [a0 - 15, b0 - 15, a1 + 15, b1 - (b1 - b0) * 0.32] : [a0 - 15, b0 + (b1 - b0) * 0.32, a1 + 15, b1 + 15]);
    hop('vaiKem', chan[0], chan[1], e + 380, chan[2], chan[3], e + 570, 50);
    // throw across the foot
    const cuoi = ngang ? (lung === 'T' ? [a1 - 420, b0 - 20, a1 + 20, b1 + 20] : [a0 - 20, b0 - 20, a0 + 420, b1 + 20])
      : (lung === 'S' ? [a0 - 20, b0 - 20, a1 + 20, b0 + 420] : [a0 - 20, b1 - 420, a1 + 20, b1 + 20]);
    hop('datNung', cuoi[0], cuoi[1], e + 560, cuoi[2], cuoi[3], e + 590, 12);
    // pillows at the head
    const so = nguoi === 2 ? 2 : 1;
    for (let i = 0; i < so; i++) {
      const s0 = ngang ? b0 : a0, s1 = ngang ? b1 : a1, L = (s1 - s0) / so;
      const p0 = s0 + i * L + 60, p1 = s0 + (i + 1) * L - 60;
      const g0 = dauGiuong + ({ T: 60, P: -460, S: -460, D: 60 }[lung]), g1 = g0 + 400;
      if (ngang) hop('vaiTrang', g0, p0, e + 520, g1, p1, e + 680, 70);
      else hop('vaiTrang', p0, g0, e + 520, p1, g1, e + 680, 70);
    }
  }

  const trongSan = (t, x, y) => (MB(t.ma).san ?? []).some((r) => x > r[0] && x < r[2] && y > r[1] && y < r[3]);
  for (const t of TANG) {
    const e = t.e;
    for (const v of MB(t.ma).noi_that ?? []) {
      const [x0, y0, x1, y1] = v.hcn;
      const ten = loaiNoiThat(v.ten);
      // pieces outside the ground floor slab stand in the yard
      const z = t.i === 0 && !trongSan(t, (x0 + x1) / 2, (y0 + y1) / 2) ? C.SAN : e;
      const zTop = v.treo ? e + 2250 : z + (ten === 'TỦ ÁO' ? 2400 : ten === 'KỆ SÁCH' ? 2000 : ten === 'TỦ LẠNH' ? 1850 : 0);
      hienTai = { pos: [], diem: [(x0 + x1) / 2000, (z + 500) / 1000, -(y0 + y1) / 2000] };
      const ham = v.treo ? MON['TỦ BẾP TRÊN'] : MON[ten];
      if (ham) ham(x0, y0, x1, y1, z, v.lung, v);
      else hop('goSoi', x0, y0, z, x1, y1, z + (v.cao ?? 750), 15); // unknown piece: a neutral block
      net.push(hienTai);
      if (zTop > e + 1200 && !v.treo) matBang.push([x0, y0, x1, y1, e + 1190]);
      if (ten === 'CHẬU CÂY') matBang.push([x0, y0, x1, y1, z + 1190]);
    }
  }
  return { nhom, net, matBang };
}
