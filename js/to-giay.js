// Annotation of a plan sheet: room names and levels, door and window tags,
// grid axes, dimension chains, lot line and title. Painted once into a canvas
// laid flat just above the cut of that floor, so it sits on the model below.
// Everything comes from the description.

import * as THREE from 'three';
import { NHA } from './du-lieu.js';
import { MUC } from './vat-lieu.js';
import { PHONG, MB, NHA_HCN, LO_DAT } from './cau-hinh.js';

const PX = 0.11; // canvas px per mm (110 px per metre)
const FONT = '"Be Vietnam Pro", "Segoe UI", Arial, sans-serif';
const capDo = (e) => (e === 0 ? '±0.000' : (e > 0 ? '+' : '') + (e / 1000).toFixed(3));

export function taoToGiay(t) {
  const dat = t.i === 0;
  const [hx0, hy0, hx1, hy1] = NHA_HCN;
  const [rx0, ry0, rx1, ry1] = dat ? LO_DAT : NHA_HCN;
  const VUNG = { x0: Math.min(rx0, hx0) - 3000, x1: Math.max(rx1, hx1) + 3500, y0: Math.min(ry0, hy0) - 4000, y1: Math.max(ry1, hy1) + 2600 };
  const W = Math.round((VUNG.x1 - VUNG.x0) * PX), H = Math.round((VUNG.y1 - VUNG.y0) * PX);
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const px = (x) => (x - VUNG.x0) * PX, py = (y) => (VUNG.y1 - y) * PX;
  g.strokeStyle = MUC; g.fillStyle = MUC;

  const chu = (s, x, y, mm, dam = 500) => {
    g.font = `${dam} ${mm * PX}px ${FONT}`;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = MUC;
    g.fillText(s, px(x), py(y));
  };
  const net = (pts, w, dash = []) => {
    g.lineWidth = w; g.setLineDash(dash.map((d) => d * PX));
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(px(x), py(y)) : g.moveTo(px(x), py(y))));
    g.stroke(); g.setLineDash([]);
  };

  if (dat && NHA.lo_dat) net([[rx0, ry0], [rx1, ry0], [rx1, ry1], [rx0, ry1], [rx0, ry0]], 1.6, [500, 120, 60, 120]);

  // room names and levels
  for (const p of PHONG.filter((q) => q.tang === t.ma)) {
    const [x0, y0, x1, y1] = p.hcn;
    const co = Math.min(270, Math.max(170, (x1 - x0) / 14));
    chu(p.ten.toUpperCase(), (x0 + x1) / 2, (y0 + y1) / 2 + 160, co, 600);
    chu(capDo(t.e), (x0 + x1) / 2, (y0 + y1) / 2 - 220, 170, 400);
  }
  for (const n of (NHA.nhan ?? []).filter((q) => q.tang === t.ma)) chu(n.ten.toUpperCase(), n.x, n.y, 220, 600);

  // door and window tags, pushed outwards from the building centre
  const cx = (hx0 + hx1) / 2, cy = (hy0 + hy1) / 2;
  for (const c of MB(t.ma).cua ?? []) {
    const [x0, y0, x1, y1] = c.hcn;
    const doc = c.doc_x ?? x1 - x0 >= y1 - y0;
    let x = (x0 + x1) / 2, y = (y0 + y1) / 2;
    if (doc) y += (y < cy ? -1 : 1) * 450; else x += (x < cx ? -1 : 1) * 450;
    g.lineWidth = 1.2;
    g.strokeRect(px(x - 260), py(y + 150), 520 * PX, 300 * PX);
    chu(c.ma, x, y, 170, 600);
  }

  // grid axes
  for (const a of NHA.truc ?? []) {
    const r = 400;
    g.lineWidth = 1.4;
    if (a.x !== undefined) {
      const by = Math.max(ry1, hy1) + 1400;
      g.beginPath(); g.arc(px(a.x), py(by), r * PX, 0, Math.PI * 2); g.stroke();
      chu(a.ten, a.x, by, 330);
      net([[a.x, by - r], [a.x, Math.min(ry0, hy0)]], 0.8, [700, 140, 80, 140]);
    } else if (a.y !== undefined) {
      const bx = Math.max(rx1, hx1) + 1900;
      g.beginPath(); g.arc(px(bx), py(a.y), r * PX, 0, Math.PI * 2); g.stroke();
      chu(a.ten, bx, a.y, 330);
      net([[bx - r, a.y], [Math.min(rx0, hx0), a.y]], 0.8, [700, 140, 80, 140]);
    }
  }

  // dimension chains
  const kt = (a, b, c, doc, chuoi) => {
    const tick = 140, P = (u, v) => (doc ? [v, u] : [u, v]);
    net([P(a, c), P(b, c)], 1);
    for (const u of chuoi) net([P(u - tick, c - tick), P(u + tick, c + tick)], 1.6);
    for (let i = 0; i < chuoi.length - 1; i++) {
      const m = (chuoi[i] + chuoi[i + 1]) / 2, len = chuoi[i + 1] - chuoi[i];
      if (len < 1) continue;
      const [tx, ty] = P(m, c + (doc ? -230 : 230));
      g.save(); g.translate(px(tx), py(ty)); if (doc) g.rotate(-Math.PI / 2);
      g.font = `400 ${190 * PX}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = MUC;
      g.fillText(String(Math.round(len)), 0, 0); g.restore();
    }
  };
  const uniq = (a) => [...new Set(a.map(Math.round))].sort((p, q) => p - q);
  const tren = Math.max(ry1, hy1), phai = Math.max(rx1, hx1);
  kt(Math.min(rx0, hx0), phai, tren + 300, false, uniq([rx0, hx0, hx1, rx1]));
  kt(Math.min(ry0, hy0), tren, phai + 500, true, uniq([ry0, hy0, hy1, ry1]));
  if (dat && NHA.lo_dat) {
    kt(rx0, rx1, tren + 650, false, [rx0, rx1]);
    kt(ry0, ry1, phai + 950, true, [ry0, ry1]);
  }

  // title
  const ty = Math.min(ry0, hy0) - 2000;
  chu(`MẶT BẰNG ${t.ten.toUpperCase()}`, (rx0 + rx1) / 2, ty, 420, 700);
  chu('TỶ LỆ 1/100', (rx0 + rx1) / 2, ty - 550, 230, 400);
  net([[(rx0 + rx1) / 2 - 2500, ty - 280], [(rx0 + rx1) / 2 + 2500, ty - 280]], 1.4);

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthTest: false, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry((VUNG.x1 - VUNG.x0) / 1000, (VUNG.y1 - VUNG.y0) / 1000), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set((VUNG.x0 + VUNG.x1) / 2000, t.e / 1000 + 1.25, -(VUNG.y0 + VUNG.y1) / 2000);
  mesh.renderOrder = 10;
  mesh.userData.catMatBang = t.e / 1000 + 1.2;
  return mesh;
}
