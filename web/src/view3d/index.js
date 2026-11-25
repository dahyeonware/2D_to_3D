// 3D 차량 뷰 (Three.js): 차체·대차·팬터그래프·전차선, 반투명 차체, 음영 튜브, 튜브 안을 흐르는 빛, 무선 파동
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TRAINSET, EQUIPMENT, CONNECTIONS, ISSUES, CARS, CARMAP, EQ, CONN, CATS, PROTO, STATUS_COLOR, ISSUE_BY_CONN } from '../data.js';
import { state, statusOf, eqVisible, connVisible, ISSUE_COLOR, DIM, isWirelessDevice, wirelessLinksOf } from '../state.js';
import { $, showTip, hideTip } from '../ui.js';
import { select, resetAll } from '../app.js';
import { pan2DToX } from '../view2d/index.js';

const to3D = (e) => new THREE.Vector3(e.pos3d.x, e.pos3d.y, e.pos3d.z);

const host = $('#view3d');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
host.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x070d1a, 160, 420);
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 2000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.08; controls.maxPolarAngle = Math.PI * 0.495; controls.minDistance = 2; controls.maxDistance = 420;
scene.add(new THREE.HemisphereLight(0xbcd7ff, 0x0b1020, 1.0));
const dl = new THREE.DirectionalLight(0xffffff, 1.3); dl.position.set(40, 80, 60); scene.add(dl);
const dl2 = new THREE.DirectionalLight(0x9fc4ff, 0.55); dl2.position.set(-60, 20, -80); scene.add(dl2);

// 텍스트 스프라이트
function textSprite(txt, sub, color = '#e8fbff') {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d');
  g.font = '600 54px "IBM Plex Mono", monospace'; g.fillStyle = color; g.textAlign = 'center'; g.fillText(txt, 256, 58);
  if (sub) { g.font = '400 32px "Noto Sans KR", sans-serif'; g.fillStyle = '#7fb4c4'; g.fillText(sub, 256, 104); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(4.8, 1.2, 1); return s;
}

function buildEnvironment() {
  const L = TRAINSET.totalLength, MIDX = L / 2;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 200), new THREE.MeshStandardMaterial({ color: 0x0a1426, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(MIDX, -0.25, 0); scene.add(ground);
  const grid = new THREE.GridHelper(600, 120, 0x1a3b66, 0x10213d); grid.position.set(MIDX, -0.24, 0); scene.add(grid);
  const ballast = new THREE.Mesh(new THREE.BoxGeometry(L + 60, 0.2, 3.6), new THREE.MeshStandardMaterial({ color: 0x1b2438 }));
  ballast.position.set(MIDX, -0.15, 0); scene.add(ballast);
  const railM = new THREE.MeshStandardMaterial({ color: 0x9aa7bd, metalness: 0.7, roughness: 0.35 });
  for (const z of [-0.7175, 0.7175]) { const r = new THREE.Mesh(new THREE.BoxGeometry(L + 60, 0.17, 0.07), railM); r.position.set(MIDX, -0.02, z); scene.add(r); }
  const n = Math.floor((L + 60) / 0.6), sl = new THREE.InstancedMesh(new THREE.BoxGeometry(0.24, 0.12, 2.6), new THREE.MeshStandardMaterial({ color: 0x3a3f4a }), n);
  const m = new THREE.Matrix4(); for (let i = 0; i < n; i++) { m.makeTranslation(-30 + i * 0.6, -0.1, 0); sl.setMatrixAt(i, m); } scene.add(sl);
  const wireM = new THREE.LineBasicMaterial({ color: 0xff8a8a, transparent: true, opacity: 0.6 });
  const wire = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-30, 5.4, 0), new THREE.Vector3(L + 30, 5.4, 0)]); scene.add(new THREE.Line(wire, wireM));
  const mess = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-30, 6.6, 0), new THREE.Vector3(L + 30, 6.6, 0)]); scene.add(new THREE.Line(mess, new THREE.LineBasicMaterial({ color: 0x6b7a99, transparent: true, opacity: 0.5 })));
  const mastM = new THREE.MeshStandardMaterial({ color: 0x5b6b88 });
  for (let x = -25; x <= L + 30; x += 50) {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 7.4, 8), mastM); mast.position.set(x, 3.45, -3.6); scene.add(mast);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 3.8), mastM); arm.position.set(x, 6.6, -1.8); scene.add(arm);
  }
}

function buildCars() {
  const bodyMat = new THREE.MeshPhysicalMaterial({ color: 0x9cc8ff, transparent: true, opacity: 0.07, roughness: 0.15, metalness: 0, side: THREE.DoubleSide, depthWrite: false });
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x5fb7ff, transparent: true, opacity: 0.45 });
  const floorMat = new THREE.MeshBasicMaterial({ color: 0x2d5d9a, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false });
  const W = TRAINSET.width;
  for (const c of CARS) {
    const g = new THREE.Group(); scene.add(g);
    if (c.type === 'PC') {
      const s = new THREE.Shape(); const len = c.length;
      s.moveTo(0.4, 1.0); s.lineTo(len - 0.2, 1.0); s.lineTo(len - 0.2, 4.0); s.lineTo(8.5, 4.0);
      s.bezierCurveTo(4.5, 3.95, 1.2, 2.8, 0.0, 1.55); s.lineTo(0.4, 1.0);
      const geo = new THREE.ExtrudeGeometry(s, { depth: W - 0.5, bevelEnabled: true, bevelThickness: 0.25, bevelSize: 0.25, bevelSegments: 4, curveSegments: 24 });
      geo.translate(0, 0, -(W - 0.5) / 2);
      const mesh = new THREE.Mesh(geo, bodyMat), edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), edgeMat);
      const holder = new THREE.Group(); holder.add(mesh, edges);
      if (c.side === 'front') holder.position.x = c.start; else { holder.scale.x = -1; holder.position.x = c.start + c.length; }
      g.add(holder);
      // 운전실 창
      const ws = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.9), new THREE.MeshBasicMaterial({ color: 0x3fd6e0, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
      ws.position.set(c.side === 'front' ? c.start + 3.1 : c.start + c.length - 3.1, 3.25, 0); ws.rotation.set(0, Math.PI / 2, c.side === 'front' ? 0.75 : -0.75); g.add(ws);
      // 팬터그래프 (지붕 → 전차선)
      const px = c.side === 'front' ? c.start + 16 : c.start + c.length - 16, pm = new THREE.MeshStandardMaterial({ color: 0xd0d6e2, metalness: 0.6, roughness: 0.4 });
      const rod = (a, b, r = 0.04) => {
        const d = new THREE.Vector3().subVectors(b, a), mm = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 6), pm);
        mm.position.copy(a).addScaledVector(d, 0.5); mm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()); g.add(mm);
      };
      const dir = c.side === 'front' ? 1 : -1;
      for (const z of [-0.45, 0.45]) {
        const a = new THREE.Vector3(px - 1.1 * dir, 4.25, z), k = new THREE.Vector3(px + 0.5 * dir, 4.85, z), t = new THREE.Vector3(px - 0.2 * dir, 5.3, 0);
        rod(a, k); rod(k, t);
      }
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.06, 1.9), pm); head.position.set(px - 0.2 * dir, 5.33, 0); g.add(head);
    } else {
      const geo = new THREE.BoxGeometry(c.length - 0.5, 3.0, W); const mesh = new THREE.Mesh(geo, bodyMat);
      mesh.position.set(c.start + c.length / 2, 2.5, 0); g.add(mesh);
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat); e.position.copy(mesh.position); g.add(e);
      // 창 띠
      const band = new THREE.Mesh(new THREE.PlaneGeometry(c.length - 3, 0.6), new THREE.MeshBasicMaterial({ color: 0x3fd6e0, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }));
      for (const z of [-W / 2 - 0.01, W / 2 + 0.01]) { const b = band.clone(); b.position.set(c.start + c.length / 2, 2.55, z); g.add(b); }
      // 연결부(갱웨이)
      const gw = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.5, 2.2), new THREE.MeshBasicMaterial({ color: 0x1d3f66, transparent: true, opacity: 0.35, depthWrite: false }));
      gw.position.set(c.start, 2.35, 0); g.add(gw);
    }
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(c.length - 0.6, W - 0.2), floorMat); floor.rotation.x = -Math.PI / 2; floor.position.set(c.start + c.length / 2, 1.25, 0); g.add(floor);
    const lab = textSprite(c.id, c.name); lab.position.set(c.start + c.length / 2, 6.2, 0); scene.add(lab);
  }
  // 대차
  const fm = new THREE.MeshStandardMaterial({ color: 0x34405a, metalness: 0.4, roughness: 0.6 }), wm = new THREE.MeshStandardMaterial({ color: 0x8893a8, metalness: 0.7, roughness: 0.3 });
  const wg = new THREE.CylinderGeometry(0.46, 0.46, 0.14, 20); wg.rotateX(Math.PI / 2);
  for (const b of TRAINSET.bogies) {
    const fr = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.3, 2.2), fm); fr.position.set(b.x, 0.62, 0); scene.add(fr);
    for (const dx of [-1.25, 1.25]) for (const z of [-0.72, 0.72]) { const w = new THREE.Mesh(wg, wm); w.position.set(b.x + dx, 0.46, z); scene.add(w); }
  }
  // 지상 기지국 철탑
  const bs = EQUIPMENT.find((e) => e.code === 'LTEBS');
  if (bs) {
    const tm = new THREE.MeshStandardMaterial({ color: 0x7c8aa5, metalness: 0.5, roughness: 0.5 });
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.45, bs.pos3d.y, 6), tm); t.position.set(bs.pos3d.x, bs.pos3d.y / 2 - 0.2, bs.pos3d.z); scene.add(t);
    const lab = textSprite('LTE-R eNB', '지상 기지국', '#c77dff'); lab.position.set(bs.pos3d.x, bs.pos3d.y + 2, bs.pos3d.z); scene.add(lab);
  }
}

// 장비 메시
const eqMesh = new Map(); const pickables = [];
function buildEquipment() {
  const eqGroup = new THREE.Group(); scene.add(eqGroup);
  for (const e of EQUIPMENT) {
    const [sx, sy, sz] = DIM(e); const col = new THREE.Color(CATS[e.category].color);
    let geo;
    if (['AXL', 'VIB', 'CCTV'].includes(e.code)) geo = new THREE.SphereGeometry(sx * 0.9, 16, 12);
    else if (e.code === 'TM') { geo = new THREE.CylinderGeometry(sy / 2, sy / 2, sx, 16); geo.rotateZ(Math.PI / 2); }
    else if (['ANT', 'WIFI'].includes(e.code)) { geo = new THREE.CylinderGeometry(sx / 2, sx / 2, sy, 20); }
    else geo = new THREE.BoxGeometry(sx, sy, sz);
    const mat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.35, roughness: 0.45, metalness: 0.15, transparent: true, opacity: 1 });
    const m = new THREE.Mesh(geo, mat); m.position.copy(to3D(e)); m.userData.id = e.id; m.userData.base = mat.emissiveIntensity;
    eqGroup.add(m); eqMesh.set(e.id, m); pickables.push(m);
  }
}

// 상태 표시 마커
const stTex = {};
function buildStatusTextures() {
  for (const [k, c] of Object.entries(STATUS_COLOR)) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d');
    g.fillStyle = c; g.strokeStyle = '#08162e'; g.lineWidth = 4; g.lineJoin = 'round'; g.beginPath();
    if (k === '고장') { g.moveTo(32, 5); g.lineTo(60, 56); g.lineTo(4, 56); g.closePath(); } else g.arc(32, 32, 27, 0, 7);
    g.fill(); g.stroke(); g.fillStyle = '#08162e'; g.font = 'bold 36px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('!', 32, k === '고장' ? 39 : 34);
    stTex[k] = new THREE.CanvasTexture(cv);
  }
}
const stMarkers = new Map();
function syncStatusMarkers() {
  for (const e of EQUIPMENT) {
    const st = statusOf(e); let s = stMarkers.get(e.id);
    if (st === '정상') { if (s) { scene.remove(s); stMarkers.delete(e.id); } continue; }
    if (!s) { s = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true })); s.scale.set(0.7, 0.7, 1); s.renderOrder = 12; scene.add(s); stMarkers.set(e.id, s); }
    s.material.map = stTex[st]; s.material.needsUpdate = true; const p = to3D(e); s.position.set(p.x, p.y + DIM(e)[1] / 2 + 0.45, p.z);
    s.visible = eqVisible(e);
  }
}

// 연결 경로
const connObj = new Map();
const TRAY = { data: { y: 3.55, z: 0.95 }, power: { y: 0.95, z: -0.95 } };
function wiredCurve(a, b, layer, id) {
  const t = TRAY[layer]; const off = (parseInt(id.slice(1)) % 5) * 0.05;
  const ty = t.y + off * (layer === 'data' ? -1 : 1), tz = t.z + off * (layer === 'data' ? 1 : -1);
  const pts = [a, new THREE.Vector3(a.x, ty, tz), new THREE.Vector3(b.x, ty, tz), b];
  const path = new THREE.CurvePath(); for (let i = 0; i < pts.length - 1; i++) if (pts[i].distanceTo(pts[i + 1]) > 1e-3) path.add(new THREE.LineCurve3(pts[i], pts[i + 1]));
  return path;
}
function buildConnections() {
  for (const c of CONNECTIONS) {
    const a = to3D(EQ.get(c.from)), b = to3D(EQ.get(c.to)); const col = new THREE.Color(PROTO[c.protocol].color);
    let curve, obj;
    if (c.type === 'wired') {
      curve = wiredCurve(a, b, c.layer, c.id); const len = curve.getLength();
      const geo = new THREE.TubeGeometry(curve, Math.min(240, Math.max(12, Math.round(len * 2.2))), c.protocol === 'ETB' ? 0.065 : 0.048, 8, false);
      obj = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.12, roughness: 0.32, metalness: 0.25, transparent: true, opacity: 0.45, depthWrite: false }));
    } else {
      const mid = a.clone().add(b).multiplyScalar(0.5); mid.y += Math.max(1.2, a.distanceTo(b) * 0.3);
      curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(80));
      obj = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: col, dashSize: 0.45, gapSize: 0.3, transparent: true, opacity: 0.6 }));
      obj.computeLineDistances();
    }
    obj.userData.id = c.id; scene.add(obj); connObj.set(c.id, { obj, curve, len: curve.getLength(), col, c });
  }
}
// 무선 전파 링 (송신측) · Wi-Fi 커버리지 (승객 단말 접속 영역)
const rings = [], wifiRings = [];
function buildRings() {
  const ringGeo = new THREE.RingGeometry(0.85, 1, 48);
  for (const c of CONNECTIONS.filter((x) => x.type === 'wireless')) {
    const src = to3D(EQ.get(c.from)); const col = new THREE.Color(PROTO[c.protocol].color);
    for (let i = 0; i < 3; i++) {
      const r = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
      r.position.copy(src); r.userData = { cid: c.id, phase: i / 3, maxR: c.protocol === 'LTER' ? 6 : c.protocol === 'BALISE' ? 0.9 : 1.4 }; scene.add(r); rings.push(r);
    }
  }
  for (const e of EQUIPMENT.filter((x) => x.code === 'WIFI')) {
    for (let i = 0; i < 2; i++) {
      const r = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xff6ec7, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }));
      r.rotation.x = -Math.PI / 2; r.position.set(e.pos3d.x, 1.3, 0); r.userData = { id: e.id, phase: i / 2 }; scene.add(r); wifiRings.push(r);
    }
  }
}
// 장치 간 문제: 직접 연결 없는 경우 전용 이슈선(점선 튜브). 이슈 변경 시 다시 생성.
let issue3D = [];
export function buildIssues3D() {
  for (const it of issue3D) { scene.remove(it.grp); it.grp.traverse((m) => { m.geometry?.dispose(); }); }
  issue3D = [];
  for (const [id, o] of connObj) {
    if (o.issue && !ISSUE_BY_CONN.has(id)) { // 해제된 이슈 연결은 원래 색으로
      o.issue = false; o.obj.material.color.copy(o.col); if (o.obj.material.emissive) { o.obj.material.emissive.copy(o.col); o.obj.material.emissiveIntensity = 0.12; }
    }
  }
  for (const is of ISSUES) {
    const a = to3D(EQ.get(is.devices[0])), b = to3D(EQ.get(is.devices[1])), col = new THREE.Color(ISSUE_COLOR[is.severity]);
    const grp = new THREE.Group(); scene.add(grp);
    if (!is.connection) {
      const m = a.clone().add(b).multiplyScalar(0.5); m.y += Math.max(2.5, a.distanceTo(b) * 0.4);
      const curve = new THREE.QuadraticBezierCurve3(a, m, b); const N = 28;
      const mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.95, depthWrite: false });
      for (let i = 0; i < N; i++) {
        const seg = new THREE.CatmullRomCurve3([curve.getPoint(i / N), curve.getPoint((i + 0.55) / N)]);
        grp.add(new THREE.Mesh(new THREE.TubeGeometry(seg, 2, 0.06, 6, false), mat));
      }
    }
    issue3D.push({ is, grp });
  }
}

// 연결선 안을 지나가는 빛 (모든 연결 동일 속도)
const FLOW_SPEED = 2.5; // m/s, 전 연결 공통
const MAXP = 1500;
const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.22, 'rgba(255,255,255,.9)');
  gr.addColorStop(0.5, 'rgba(255,255,255,.28)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const pPos = new Float32Array(MAXP * 3), pCol = new Float32Array(MAXP * 3), pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3).setUsage(THREE.DynamicDrawUsage));
pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3).setUsage(THREE.DynamicDrawUsage));
const glow = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.55, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
glow.frustumCulled = false; glow.renderOrder = 5; scene.add(glow);
const tmpV = new THREE.Vector3(), tmpC = new THREE.Color(), WHITE = new THREE.Color(1, 1, 1);
// 선택 헤일로
const halo = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.05, 48), new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, side: THREE.DoubleSide, depthTest: false }));
halo.visible = false; halo.renderOrder = 10; scene.add(halo);

export function style3D() {
  const hl = state.hl;
  for (const [id, m] of eqMesh) {
    const e = EQ.get(id), vis = eqVisible(e); m.visible = vis;
    const inHL = !hl || hl.nodes.has(id);
    m.material.opacity = inHL ? 1 : 0.12; m.material.depthWrite = inHL;
    const isImpact = hl && state.mode === 'impact' && hl.nodes.has(id) && !hl.roots.has(id);
    m.material.emissive.set(isImpact ? '#ff3b3b' : CATS[e.category].color);
    m.userData.base = hl && inHL ? 0.7 : 0.35; m.scale.setScalar(1);
  }
  for (const it of issue3D) {
    const vis = it.is.devices.every((d) => eqVisible(EQ.get(d))); it.grp.visible = vis;
    const op = !hl || it.is.devices.some((d) => hl.nodes.has(d)) ? 1 : 0.15; it.grp.traverse((m) => { if (m.material) m.material.opacity = 0.95 * op; });
  }
  for (const [id, o] of connObj) {
    const vis = connVisible(o.c); o.obj.visible = vis;
    const on = hl ? hl.edges.has(id) : false;
    const is = ISSUE_BY_CONN.get(id);
    if (is) {
      const ic = new THREE.Color(ISSUE_COLOR[is.severity]); o.obj.material.color.copy(ic); if (o.obj.material.emissive) o.obj.material.emissive.copy(ic);
      o.obj.material.opacity = !hl || on || is.devices.some((d) => hl.nodes.has(d)) ? 0.95 : 0.12; o.issue = true; continue;
    }
    o.obj.material.opacity = hl ? (on ? (o.c.type === 'wired' ? 0.88 : 0.9) : 0.04) : o.c.type === 'wired' ? 0.42 : 0.55;
  }
  // 파동(무선 송신·Wi-Fi 서비스 영역): 기본 숨김, 무선 장비 선택 후 [무선 범위 보기]를 눌렀을 때만 표시
  const rangeOn = state.showRange && state.selected && isWirelessDevice(state.selected);
  const wls = rangeOn ? wirelessLinksOf(state.selected) : new Set();
  if (rangeOn && state.hl && state.mode === 'path') for (const id of state.hl.edges) if (CONN.get(id).type === 'wireless') wls.add(id);
  for (const r of rings) { const c = CONN.get(r.userData.cid); r.visible = rangeOn && connVisible(c) && wls.has(c.id); }
  for (const r of wifiRings) { r.visible = rangeOn && state.wireless && r.userData.id === state.selected; }
  syncStatusMarkers();
  if (state.selected) {
    halo.visible = true; halo.position.copy(to3D(EQ.get(state.selected))); const s = DIM(EQ.get(state.selected)); halo.userData.r = Math.max(0.5, Math.max(s[0], s[2]) * 0.5);
  } else halo.visible = false;
}

// 카메라 이동
let fly = null;
function flyTo(target, pos, dur = 900) { fly = { t0: performance.now(), dur, fromP: camera.position.clone(), fromT: controls.target.clone(), toP: pos, toT: target }; }
export function focusEq(id) {
  const p = to3D(EQ.get(id)); const dir = camera.position.clone().sub(controls.target).setY(0).normalize();
  if (!isFinite(dir.x) || dir.lengthSq() < 0.1) dir.set(0.5, 0, 0.86);
  const d = DIM(EQ.get(id)), dist = 8 + Math.max(...d) * 2.2; const off = dir.multiplyScalar(dist).add(new THREE.Vector3(0, dist * 0.45, 0)); flyTo(p.clone(), p.clone().add(off));
}
export function focusCar(id) {
  const c = CARMAP[id]; const cx = c.start + c.length / 2;
  flyTo(new THREE.Vector3(cx, 2.2, 0), new THREE.Vector3(cx - 6, 10, c.length * 1.05 + 6));
  document.querySelectorAll('#carBtns button').forEach((b) => b.classList.toggle('on', b.dataset.car === id)); $('#h3d').textContent = `${c.id} · ${c.name}`;
}
export function focusAll() {
  flyTo(new THREE.Vector3(72, 1.5, 0), new THREE.Vector3(-34, 34, 58));
  document.querySelectorAll('#carBtns button').forEach((b) => b.classList.toggle('on', b.dataset.car === 'ALL')); $('#h3d').textContent = '전체 편성';
}
export function focusSet(ids) {
  const box = new THREE.Box3(); for (const id of ids) box.expandByPoint(to3D(EQ.get(id)));
  const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
  const halfW = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect; // 화면 폭에 맞춰 거리 계산
  const d = Math.max(14, (s.x * 0.55 + 6) / halfW, Math.max(s.z, s.y) * 2.2);
  flyTo(c, c.clone().add(new THREE.Vector3(-d * 0.2, d * 0.42, d * 0.85)));
}
$('#carBtns').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.car === 'ALL') focusAll(); else { focusCar(b.dataset.car); pan2DToX(CARMAP[b.dataset.car].start + CARMAP[b.dataset.car].length / 2); }
});
$('#b3dFit').onclick = focusAll;

// 피킹
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(); let down3 = null;
function pick(e) {
  const r = renderer.domElement.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera); const hits = ray.intersectObjects(pickables.filter((m) => m.visible), false);
  const h = hits.find((x) => !state.hl || state.hl.nodes.has(x.object.userData.id)) || hits[0]; return h ? h.object.userData.id : null;
}
renderer.domElement.addEventListener('pointerdown', (e) => { down3 = { x: e.clientX, y: e.clientY }; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (down3 && Math.hypot(e.clientX - down3.x, e.clientY - down3.y) < 5) { const id = pick(e); if (id) { if (id === state.selected) resetAll(); else select(id, { from: '3d' }); } }
  down3 = null;
});
let lastMove = 0;
renderer.domElement.addEventListener('pointermove', (e) => {
  if (e.buttons) { hideTip(); return; } const now = performance.now(); if (now - lastMove < 40) return; lastMove = now;
  const id = pick(e); renderer.domElement.style.cursor = id ? 'pointer' : ''; if (id) showTip(id, e.clientX, e.clientY); else hideTip();
});
renderer.domElement.addEventListener('pointerleave', hideTip);
controls.addEventListener('start', () => { fly = null; });

function resize() { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }

const clock = new THREE.Clock();
function tick() {
  const t = clock.getElapsedTime();
  if (fly) {
    const p = Math.min(1, (performance.now() - fly.t0) / fly.dur), e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
    camera.position.lerpVectors(fly.fromP, fly.toP, e); controls.target.lerpVectors(fly.fromT, fly.toT, e); if (p >= 1) fly = null;
  }
  controls.update();
  // 선택/강조 펄스
  for (const [id, m] of eqMesh) {
    if (!m.visible) continue; const root = state.hl && state.hl.roots.has(id);
    m.material.emissiveIntensity = root ? 0.8 + 0.6 * Math.sin(t * 6) : m.userData.base;
    if (root) m.scale.setScalar(1 + 0.18 * (0.5 + 0.5 * Math.sin(t * 6)));
  }
  for (const [id, s] of stMarkers) if (statusOf(EQ.get(id)) === '고장') s.material.opacity = 0.55 + 0.45 * Math.sin(t * 5.5);
  if (halo.visible) { halo.quaternion.copy(camera.quaternion); const s = halo.userData.r * (1.2 + 0.35 * ((t * 1.4) % 1)); halo.scale.setScalar(s); halo.material.opacity = 0.85 - ((t * 1.4) % 1) * 0.75; }
  // 전파 링
  for (const r of rings) { if (!r.visible) continue; const ph = (t * 0.6 + r.userData.phase) % 1; r.scale.setScalar(0.2 + ph * r.userData.maxR); r.material.opacity = 0.65 * (1 - ph); r.quaternion.copy(camera.quaternion); }
  for (const r of wifiRings) { if (!r.visible) continue; const ph = (t * 0.35 + r.userData.phase) % 1; r.scale.setScalar(0.3 + ph * 4.2); r.material.opacity = 0.35 * (1 - ph); }
  // 장치 간 문제 깜빡임
  const blinkK = 0.5 + 0.5 * Math.sin(t * 5.5);
  for (const [, o] of connObj) if (o.issue && o.obj.visible && o.obj.material.emissive) o.obj.material.emissiveIntensity = 0.25 + 0.85 * blinkK;
  // 연결선 안을 지나가는 빛 (간격 일정, 속도 동일)
  let n = 0; const hl = state.hl;
  for (const [id, o] of connObj) {
    if (!o.obj.visible) continue; const on = hl ? hl.edges.has(id) : true; if (!on) continue;
    const gap = hl ? 8 : 24; const k = Math.max(o.c.direction === 'bidirectional' ? 2 : 1, Math.round(o.len / gap)); const inten = hl ? 1 : 0.55;
    const is = o.issue && ISSUE_BY_CONN.get(id);
    tmpC.copy(is ? new THREE.Color(ISSUE_COLOR[is.severity]) : o.col).lerp(WHITE, 0.35).multiplyScalar(inten);
    const bi = o.c.direction === 'bidirectional';
    for (let i = 0; i < k && n < MAXP; i++) {
      let u = ((t * FLOW_SPEED) / o.len + i / k) % 1; if (bi && i % 2) u = 1 - u; o.curve.getPointAt(u, tmpV);
      pPos[n * 3] = tmpV.x; pPos[n * 3 + 1] = tmpV.y; pPos[n * 3 + 2] = tmpV.z; pCol[n * 3] = tmpC.r; pCol[n * 3 + 1] = tmpC.g; pCol[n * 3 + 2] = tmpC.b; n++;
    }
  }
  pGeo.setDrawRange(0, n); pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

function updateRangeBtn() {
  const b = $('#btnRange'), ok = state.selected && isWirelessDevice(state.selected);
  b.style.display = ok ? '' : 'none';
  b.classList.toggle('on', !!(ok && state.showRange));
  b.querySelector('span').textContent = state.showRange ? '무선 범위 숨기기' : '무선 범위 보기';
}
export { updateRangeBtn };
$('#btnRange').onclick = () => { state.showRange = !state.showRange; style3D(); updateRangeBtn(); };

export function init3D() {
  buildEnvironment();
  buildCars();
  buildEquipment();
  buildStatusTextures();
  buildConnections();
  buildRings();
  buildIssues3D();
  $('#carBtns').innerHTML = `<button data-car="ALL" class="on">전체</button>` + CARS.map((c) => `<button data-car="${c.id}">${c.id}</button>`).join('');
  resize();
  new ResizeObserver(resize).observe(host);
  camera.position.set(-34, 34, 58); controls.target.set(72, 1.5, 0);
  tick();
}
