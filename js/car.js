/* =========================================================================
   FORM / 01 — AURELIS GT
   Procedural, faceted concept coupe. Every visible system is a separate,
   selectable part with an exploded-view vector.
   Units: metres. +Z = front, +X = right, +Y = up.
   ========================================================================= */
(function () {
  'use strict';

  const {
    MeshBuilder, M4, basisMatrix, clamp, lerp, smoothstep,
    add, sub, mul, dot, cross, normalize, mix3, average,
  } = window.G;

  const CAR = (window.CAR = { parts: [], categories: [], specs: {} });

  CAR.categories = [
    { id: 'body', name: '车身覆盖件', en: 'BODY PANELS' },
    { id: 'lighting', name: '灯具与格栅', en: 'LIGHTING / GRILLE' },
    { id: 'glazing', name: '玻璃与饰件', en: 'GLAZING / TRIM' },
    { id: 'wheels', name: '车轮与制动', en: 'WHEELS / BRAKES' },
    { id: 'chassis', name: '底盘与悬挂', en: 'CHASSIS / SUSPENSION' },
    { id: 'powertrain', name: '动力总成', en: 'POWERTRAIN' },
    { id: 'interior', name: '座舱内饰', en: 'INTERIOR' },
    { id: 'aero', name: '空气动力学', en: 'AERODYNAMICS' },
  ];

  CAR.materials = {
    clay:      { color: '#b9b7b1', spec: 0.22, shine: 16, metal: 0.0, label: '车身灰泥 / CLAY' },
    clayLight: { color: '#c9c7c0', spec: 0.24, shine: 18, metal: 0.0, label: '高光灰泥 / CLAY LIGHT' },
    clayDark:  { color: '#8e8d88', spec: 0.18, shine: 14, metal: 0.0, label: '深灰泥 / CLAY DARK' },
    panel:     { color: '#a4a29c', spec: 0.20, shine: 14, metal: 0.0, label: '内板件 / INNER PANEL' },
    dark:      { color: '#343638', spec: 0.20, shine: 28, metal: 0.1, label: '石墨件 / GRAPHITE' },
    trim:      { color: '#232526', spec: 0.24, shine: 34, metal: 0.1, label: '黑色饰条 / TRIM' },
    rubber:    { color: '#202223', spec: 0.08, shine: 10, metal: 0.0, label: '轮胎橡胶 / RUBBER' },
    metal:     { color: '#888b8c', spec: 0.70, shine: 64, metal: 0.7, label: '机械金属 / MACHINED METAL' },
    steel:     { color: '#5b5e5f', spec: 0.52, shine: 44, metal: 0.5, label: '深色钢件 / DARK STEEL' },
    brake:     { color: '#686a69', spec: 0.32, shine: 30, metal: 0.4, label: '制动铸铁 / BRAKE IRON' },
    interior:  { color: '#5f605c', spec: 0.14, shine: 12, metal: 0.0, label: '内饰灰泥 / INTERIOR' },
    fabric:    { color: '#777874', spec: 0.07, shine: 6, metal: 0.0, label: '织物 / WOVEN FABRIC' },
    glass:     { color: '#7b8688', spec: 0.95, shine: 96, metal: 0.2, alpha: 0.30, label: '烟色玻璃 / SMOKED GLASS' },
    glassDark: { color: '#3f484a', spec: 0.95, shine: 90, metal: 0.3, alpha: 0.42, label: '深色玻璃 / DARK GLASS' },
    lamp:      { color: '#d8dad5', spec: 0.92, shine: 80, metal: 0.0, label: '灯罩 / LAMP LENS' },
    lampDark:  { color: '#949895', spec: 0.60, shine: 48, metal: 0.3, label: '灯腔 / LAMP HOUSING' },
  };

  const D = {
    wheelY: 0.365,
    tireR: 0.372,
    archR: 0.425,
    frontAxle: 1.35,
    rearAxle: -1.35,
    wheelX: 0.825,
    tireW: 0.305,
    rimR: 0.252,
  };
  CAR.dims = D;

  const widthKeys = [
    [2.34, 0.70], [2.22, 0.80], [2.08, 0.885], [1.90, 0.95], [1.72, 0.992],
    [1.35, 1.006], [1.05, 0.998], [0.55, 0.985], [0.0, 0.98], [-0.55, 0.985],
    [-1.02, 0.998], [-1.35, 1.01], [-1.65, 0.992], [-1.88, 0.95],
    [-2.08, 0.885], [-2.24, 0.80], [-2.34, 0.70],
  ];
  const beltKeys = [
    [2.34, 0.63], [2.20, 0.685], [2.02, 0.74], [1.78, 0.795], [1.55, 0.828],
    [1.35, 0.848], [1.10, 0.858], [0.55, 0.866], [0.0, 0.868], [-0.55, 0.862],
    [-0.95, 0.845], [-1.35, 0.826], [-1.65, 0.805], [-1.88, 0.78],
    [-2.08, 0.745], [-2.24, 0.69], [-2.34, 0.63],
  ];
  const bottomBase = 0.255;

  function sampleKeys(keys, z) {
    if (z <= keys[0][0]) return keys[0][1];
    if (z >= keys[keys.length - 1][0]) return keys[keys.length - 1][1];
    for (let i = 0; i < keys.length - 1; i++) {
      const a = keys[i], b = keys[i + 1];
      const lo = Math.min(a[0], b[0]), hi = Math.max(a[0], b[0]);
      if (z >= lo && z <= hi) {
        const t = (z - a[0]) / (b[0] - a[0]);
        return lerp(a[1], b[1], t);
      }
    }
    return keys[keys.length - 1][1];
  }
  const halfWidth = (z) => sampleKeys(widthKeys, z);
  const beltline = (z) => sampleKeys(beltKeys, z);

  function archBottom(z, zc, base = bottomBase) {
    const dz = z - zc;
    if (Math.abs(dz) >= D.archR) return base;
    return D.wheelY + Math.sqrt(Math.max(0, D.archR * D.archR - dz * dz));
  }

  const rad = (deg) => (deg * Math.PI) / 180;

  let codeCounters = {};
  function nextCode(prefix) {
    codeCounters[prefix] = (codeCounters[prefix] || 0) + 1;
    return prefix + '-' + String(codeCounters[prefix]).padStart(2, '0');
  }

  function registerPart(cfg) {
    const b = new MeshBuilder();
    cfg.build(b);
    const geo = b.finish();
    if (!geo.meshes.length) {
      console.warn('Empty part:', cfg.id);
    }
    const mats = [...new Set(geo.meshes.map((m) => m.mat))];
    const center = average([geo.bounds.min, geo.bounds.max]);
    const part = {
      id: cfg.id,
      name: cfg.name,
      en: cfg.en || '',
      cat: cfg.cat,
      code: cfg.code || nextCode(cfg.prefix || 'PRT'),
      desc: cfg.desc || '',
      meshes: geo.meshes,
      bounds: geo.bounds,
      center,
      triCount: geo.triCount,
      explode: cfg.explode || [0, 0, 0],
      delay: cfg.delay == null ? 0.04 : cfg.delay,
      visible: true,
      pick: cfg.pick !== false,
      castShadow: cfg.castShadow !== false,
      mats,
      materialLabel: cfg.materialLabel || (CAR.materials[mats[0]] && CAR.materials[mats[0]].label) || mats[0],
      group: cfg.group || null,
    };
    part.dims = [
      (part.bounds.max[0] - part.bounds.min[0]) * 1000,
      (part.bounds.max[1] - part.bounds.min[1]) * 1000,
      (part.bounds.max[2] - part.bounds.min[2]) * 1000,
    ];
    CAR.parts.push(part);
    return part;
  }
  CAR.registerPart = registerPart;

  /* -----------------------------------------------------------------------
     shared geometry helpers
     ----------------------------------------------------------------------- */
  function addArchLip(b, side, zc, mat = 'trim', extra = 0) {
    const pts = [];
    const n = 16;
    for (let i = 0; i <= n; i++) {
      const th = (i / n) * Math.PI;
      const z = zc - Math.cos(th) * (D.archR + extra);
      const y = D.wheelY + Math.sin(th) * (D.archR + extra);
      const x = side * (halfWidth(z) - 0.003);
      pts.push([x, y, z]);
    }
    b.addPolylineTube(pts, 0.016, 6, mat, false);
  }

  function makeSideGrid(side, zs, bottomFn, topFn) {
    const grid = [];
    for (const z of zs) {
      const w = halfWidth(z);
      const top = topFn ? topFn(z) : beltline(z);
      let bottom = bottomFn ? bottomFn(z) : bottomBase;
      bottom = Math.min(bottom, top - 0.045);
      const h = Math.max(0.05, top - bottom);
      const y = [
        bottom + 0.012,
        bottom + h * 0.20,
        bottom + h * 0.46,
        bottom + h * 0.72,
        top,
        top + 0.007,
      ];
      const x = [
        w - 0.075,
        w - 0.018,
        w,
        w - 0.012,
        w - 0.052,
        w - 0.19,
      ];
      grid.push(y.map((yy, i) => [side * x[i], yy, z]));
    }
    return grid;
  }

  function makeWheelArchZs(zc, tail = []) {
    const zs = [];
    const n = 14;
    // from the front side of the arch to its rear side, densely sampled
    for (let i = 0; i <= n; i++) {
      const th = (i / n) * Math.PI;
      const z = zc + Math.cos(th) * D.archR;
      zs.push(z);
    }
    return zs.concat(tail);
  }

  function addLoft(b, rings, mat, shade = 1, capStart = true, capEnd = true) {
    const m = rings[0].length;
    for (let r = 0; r < rings.length - 1; r++) {
      for (let i = 0; i < m; i++) {
        const j = (i + 1) % m;
        b.addQuad(rings[r][i], rings[r][j], rings[r + 1][j], rings[r + 1][i], mat, shade);
      }
    }
    if (capStart) b.addPolygon3D(rings[0], mat, shade);
    if (capEnd) b.addPolygon3D(rings[rings.length - 1], mat, shade);
  }

  function closedProfileRing(halfYZ, z) {
    // halfYZ: from bottom-centre to top-centre; mirrored into a closed ring
    const half = halfYZ.map(([x, y]) => [x, y]);
    const full = half.slice();
    for (let i = half.length - 2; i >= 1; i--) full.push([-half[i][0], half[i][1]]);
    return full.map(([x, y]) => [x, y, z]);
  }

  function hoodY(z) {
    // top of the bonnet with a subtle centre power dome
    const base = 0.855 - smoothstep(0.55, 2.04, z) * 0.135;
    return base;
  }
  function hoodHalfWidth(z) {
    return halfWidth(z) - 0.065;
  }

  /* -----------------------------------------------------------------------
     BODY PANELS
     ----------------------------------------------------------------------- */
  function buildBody() {
    registerPart({
      id: 'body_inner', cat: 'body', name: '车身内壳', en: 'BODY-IN-WHITE / TUB', code: 'BDY-01',
      desc: '座舱内壳、前隔板、后隔板与地板骨架。为所有外覆盖件提供安装基准，爆炸视图中保留整车基准。',
      explode: [0, 0, 0], delay: 0.0, build: (b) => {
        const m = 'interior';
        b.addBox(0, 0.34, -0.32, 1.48, 0.16, 1.68, m); // cabin floor
        b.addBox(0, 0.52, 0.62, 1.56, 0.64, 0.06, m); // firewall
        b.addBox(0, 0.58, -1.28, 1.42, 0.58, 0.06, m); // rear bulkhead
        b.addBox(0, 0.41, -0.32, 0.24, 0.22, 1.72, m); // tunnel
        b.addBox(0, 0.30, 1.48, 1.30, 0.16, 1.02, m); // under-engine
        b.addBox(-0.59, 0.55, 1.62, 0.07, 0.36, 1.15, 'dark');
        b.addBox(0.59, 0.55, 1.62, 0.07, 0.36, 1.15, 'dark');
        // seat pedestals
        b.addBox(-0.36, 0.37, -0.15, 0.44, 0.08, 0.56, 'dark');
        b.addBox(0.36, 0.37, -0.15, 0.44, 0.08, 0.56, 'dark');
        b.addBox(0, 0.77, -1.18, 1.36, 0.04, 0.28, 'interior');
      },
    });

    // front bumper — lofted faceted fascia
    registerPart({
      id: 'front_bumper', cat: 'body', name: '前保险杠', en: 'FRONT FASCIA', code: 'BDY-02',
      desc: '前部主保险杠蒙皮，含号牌座安装面。与前翼子板、前舱盖保持 12mm 工艺缝。',
      explode: [0, 0.07, 0.62], delay: 0.14, build: (b) => {
        const sections = [
          { z: 2.02, half: [[0, 0.205], [0.42, 0.16], [0.70, 0.185], [0.865, 0.27], [0.905, 0.42], [0.89, 0.585], [0.82, 0.675], [0.58, 0.712], [0, 0.725]] },
          { z: 2.15, half: [[0, 0.175], [0.39, 0.145], [0.64, 0.18], [0.79, 0.265], [0.83, 0.41], [0.81, 0.55], [0.73, 0.63], [0.49, 0.672], [0, 0.69]] },
          { z: 2.25, half: [[0, 0.165], [0.32, 0.145], [0.53, 0.20], [0.66, 0.28], [0.70, 0.40], [0.675, 0.51], [0.585, 0.575], [0.36, 0.612], [0, 0.625]] },
          { z: 2.315, half: [[0, 0.235], [0.25, 0.235], [0.39, 0.285], [0.47, 0.345], [0.495, 0.425], [0.455, 0.505], [0.35, 0.55], [0.22, 0.565], [0, 0.57]] },
        ];
        const rings = sections.map((s) => closedProfileRing(s.half, s.z));
        addLoft(b, rings, 'clay', 1, true, true);
        // lower lip shadow gap
        b.addBox(0, 0.15, 2.075, 1.52, 0.035, 0.05, 'trim');
      },
    });

    // front splitter
    registerPart({
      id: 'front_splitter', cat: 'aero', name: '前分流器', en: 'FRONT SPLITTER', code: 'AER-01',
      desc: '双层前唇，中央后掠，两端带上翘导流翼片。',
      explode: [0, -0.09, 0.72], delay: 0.22, build: (b) => {
        const m = basisMatrix([0, 0.10, 0], [1, 0, 0], [0, 0, 1], [0, 1, 0]);
        b.addPrism2D([
          [-0.97, 2.02], [-0.80, 2.36], [-0.42, 2.43], [0, 2.45], [0.42, 2.43],
          [0.80, 2.36], [0.97, 2.02], [0.87, 1.94], [-0.87, 1.94],
        ], 0, 0.034, m, 'dark');
        // fences
        b.addBeam([-0.92, 0.12, 2.20], [-0.84, 0.19, 2.38], 0.028, 0.10, 'trim');
        b.addBeam([0.92, 0.12, 2.20], [0.84, 0.19, 2.38], 0.028, 0.10, 'trim');
        b.addBox(0, 0.118, 2.18, 1.10, 0.018, 0.03, 'trim');
      },
    });

    // bonnet
    registerPart({
      id: 'hood', cat: 'body', name: '前舱盖', en: 'BONNET', code: 'BDY-03',
      desc: '铝合金前舱盖，双筋线、后缘上翻；下方为 V8 动力总成。',
      explode: [0, 0.58, 0.30], delay: 0.10, build: (b) => {
        const zs = [0.545, 0.70, 0.90, 1.10, 1.30, 1.50, 1.68, 1.84, 1.97, 2.045];
        const us = [-1, -0.78, -0.48, -0.20, 0, 0.20, 0.48, 0.78, 1];
        const grid = [];
        for (const z of zs) {
          const hw = hoodHalfWidth(z);
          const base = hoodY(z);
          const col = us.map((u) => {
            const crown = 0.026 * (1 - u * u) + 0.009 * Math.cos(u * Math.PI * 2.0);
            const edgeDrop = -0.014 * Math.pow(Math.abs(u), 4);
            return [u * hw, base + crown + edgeDrop, z];
          });
          grid.push(col);
        }
        b.addClosedGrid(grid, [0, -0.043, 0], 'clay');
        // structural underside ribs
        b.addBeam([-0.62, hoodY(1.2) - 0.055, 1.20], [0.62, hoodY(1.2) - 0.055, 1.20], 0.035, 0.045, 'panel');
        b.addBeam([-0.54, hoodY(1.65) - 0.055, 1.65], [0.54, hoodY(1.65) - 0.055, 1.65], 0.035, 0.045, 'panel');
        b.addBeam([-0.37, hoodY(0.72) - 0.06, 0.72], [-0.48, hoodY(1.75) - 0.06, 1.75], 0.028, 0.035, 'panel');
        b.addBeam([0.37, hoodY(0.72) - 0.06, 0.72], [0.48, hoodY(1.75) - 0.06, 1.75], 0.028, 0.035, 'panel');
        // hinge blocks
        b.addBox(-0.48, 0.815, 0.62, 0.08, 0.055, 0.13, 'metal');
        b.addBox(0.48, 0.815, 0.62, 0.08, 0.055, 0.13, 'metal');
      },
    });

    registerPart({
      id: 'hood_vents', cat: 'body', name: '舱盖通风口', en: 'BONNET VENTS', code: 'BDY-04',
      desc: '左右两组深色散热格栅，为发动机舱导出热风。',
      explode: [0, 0.64, 0.28], delay: 0.13, build: (b) => {
        for (const s of [-1, 1]) {
          const cx = s * 0.38, cz = 1.44;
          const y = hoodY(cz) + 0.034;
          for (let i = 0; i < 4; i++) {
            b.addBox(cx, y + 0.002, cz + (i - 1.5) * 0.043, 0.235, 0.012, 0.022, 'trim');
          }
          b.addBox(cx, y - 0.006, cz, 0.265, 0.008, 0.205, 'dark');
          b.addBeam([cx - 0.14, y + 0.01, cz - 0.12], [cx + 0.14, y + 0.01, cz - 0.12], 0.012, 0.014, 'metal');
          b.addBeam([cx - 0.14, y + 0.01, cz + 0.12], [cx + 0.14, y + 0.01, cz + 0.12], 0.012, 0.014, 'metal');
        }
      },
    });

    // front fenders
    for (const side of [-1, 1]) {
      const suffix = side < 0 ? 'L' : 'R';
      const zs = [2.035, 1.985, 1.93, 1.875, 1.815, 1.775];
      const arch = makeWheelArchZs(D.frontAxle);
      const rear = [0.93, 0.88, 0.845];
      const all = zs.concat(arch.filter((z) => z < 1.79)).concat(rear);
      registerPart({
        id: 'fender_' + suffix.toLowerCase(), cat: 'body', name: `前翼子板 ${suffix}`, en: `FRONT FENDER ${suffix}`, code: `BDY-${side < 0 ? '05' : '06'}`,
        desc: '前翼子板，含轮拱翻边与前轮后方导流鳃。安装于车身内壳，拆下后可见悬挂与前轮内衬。',
        explode: [side * 0.38, 0.10, 0.0], delay: 0.18, build: (b) => {
          const grid = makeSideGrid(side, all, (z) => archBottom(z, D.frontAxle), (z) => beltline(z));
          b.addClosedGrid(grid, [-side * 0.030, 0, 0], 'clay');
          addArchLip(b, side, D.frontAxle);
          // fender top shut line
          b.addBeam([side * (halfWidth(2.015) - 0.15), beltline(2.015) + 0.012, 2.015],
            [side * (halfWidth(0.87) - 0.15), beltline(0.87) + 0.012, 0.87], 0.012, 0.008, 'trim');
        },
      });
    }

    // doors
    for (const side of [-1, 1]) {
      const suffix = side < 0 ? 'L' : 'R';
      const zs = [0.84, 0.70, 0.54, 0.35, 0.15, -0.05, -0.25, -0.45, -0.62, -0.78, -0.84];
      registerPart({
        id: 'door_' + suffix.toLowerCase(), cat: 'body', name: `车门 ${suffix}`, en: `DOOR ${suffix}`, code: `BDY-${side < 0 ? '07' : '08'}`,
        desc: '无框车门总成：外蒙皮、门内板、扶手与扬声器。爆炸视图中与侧窗分离，可查看座舱侧壁。',
        explode: [side * 0.58, 0.06, 0.02], delay: 0.20, build: (b) => {
          const grid = makeSideGrid(side, zs, () => bottomBase, (z) => beltline(z));
          b.addClosedGrid(grid, [-side * 0.032, 0, 0], 'clay');
        },
      });

      registerPart({
        id: 'door_handle_' + suffix.toLowerCase(), cat: 'body', name: `门把手 ${suffix}`, en: `DOOR HANDLE ${suffix}`, code: `BDY-${side < 0 ? '09' : '10'}`,
        desc: '隐藏式门把手，深色凹槽内嵌拉手。',
        explode: [side * 0.68, 0.10, 0.0], delay: 0.28, build: (b) => {
          const x = side * (halfWidth(-0.02) - 0.001);
          b.addBox(x, 0.735, -0.04, 0.022, 0.044, 0.205, 'trim');
          b.addBox(x + side * 0.006, 0.735, -0.03, 0.012, 0.022, 0.15, 'metal');
        },
      });
    }

    // rear quarters
    for (const side of [-1, 1]) {
      const suffix = side < 0 ? 'L' : 'R';
      const arch = makeWheelArchZs(D.rearAxle);
      const zs = [-0.845, -0.90].concat(arch.filter((z) => z < -0.92)).concat([-1.84, -1.92, -2.00, -2.055]);
      registerPart({
        id: 'quarter_' + suffix.toLowerCase(), cat: 'body', name: `后翼子板 ${suffix}`, en: `REAR QUARTER ${suffix}`, code: `BDY-${side < 0 ? '11' : '12'}`,
        desc: '后侧围总成，健壮的轮拱肩线；内部为加油口、后轮内衬与后悬挂安装点。',
        explode: [side * 0.42, 0.07, -0.02], delay: 0.17, build: (b) => {
          const grid = makeSideGrid(side, zs, (z) => archBottom(z, D.rearAxle), (z) => beltline(z));
          b.addClosedGrid(grid, [-side * 0.030, 0, 0], 'clay');
          addArchLip(b, side, D.rearAxle);
          // C-pillar/quarter shoulder shut line
          b.addBeam([side * (halfWidth(-0.87) - 0.15), beltline(-0.87) + 0.012, -0.87],
            [side * (halfWidth(-2.04) - 0.12), beltline(-2.04) + 0.005, -2.04], 0.010, 0.008, 'trim');
        },
      });
    }

    // rocker / side skirts
    for (const side of [-1, 1]) {
      const suffix = side < 0 ? 'L' : 'R';
      registerPart({
        id: 'side_skirt_' + suffix.toLowerCase(), cat: 'body', name: `侧裙 ${suffix}`, en: `SIDE SKIRT ${suffix}`, code: `BDY-${side < 0 ? '13' : '14'}`,
        desc: '侧裙扰流件，连接前后轮拱下沿，降低侧向气流。',
        explode: [side * 0.46, -0.05, 0.0], delay: 0.24, build: (b) => {
          const m = basisMatrix([0, 0, -0.86], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
          b.addPrism2D([
            [side * 0.80, 0.295], [side * 0.912, 0.272], [side * 0.934, 0.232],
            [side * 0.900, 0.185], [side * 0.805, 0.172], [side * 0.778, 0.222],
          ], 0, 1.72, m, 'clayDark');
          b.addBox(side * 0.897, 0.158, 0.0, 0.042, 0.014, 1.40, 'dark');
        },
      });
    }

    // roof
    registerPart({
      id: 'roof', cat: 'body', name: '车顶', en: 'ROOF PANEL', code: 'BDY-15',
      desc: '双曲率车顶钣金，前后横梁加强。与 A/C 柱、风挡和后窗相连。',
      explode: [0, 0.72, 0.0], delay: 0.11, build: (b) => {
        const cols = [-0.085, -0.20, -0.34, -0.48, -0.62, -0.735];
        const us = [-1, -0.62, -0.22, 0.22, 0.62, 1];
        const grid = [];
        for (const z of cols) {
          const t = (z + 0.085) / (-0.735 + 0.085);
          const hw = lerp(0.615, 0.595, t);
          const base = lerp(1.278, 1.262, t * t);
          const col = us.map((u) => [u * hw, base + 0.020 * (1 - u * u), z]);
          grid.push(col);
        }
        b.addClosedGrid(grid, [0, -0.045, 0], 'clay');
        // roof rails + glass-frame bridge
        b.addBeam([-0.607, 1.263, -0.095], [-0.585, 1.244, -0.735], 0.040, 0.026, 'trim');
        b.addBeam([0.607, 1.263, -0.095], [0.585, 1.244, -0.735], 0.040, 0.026, 'trim');
        b.addBeam([-0.595, 1.249, -0.10], [-0.575, 1.234, -0.72], 0.018, 0.018, 'clayDark');
        b.addBeam([0.595, 1.249, -0.10], [0.575, 1.234, -0.72], 0.018, 0.018, 'clayDark');
        // interior headliner
        b.addBox(0, 1.215, -0.41, 1.10, 0.025, 0.57, 'interior');
        b.addBeam([-0.58, 1.24, -0.10], [0.58, 1.24, -0.10], 0.03, 0.04, 'panel');
      },
    });

    // A pillars
    for (const side of [-1, 1]) {
      const suffix = side < 0 ? 'L' : 'R';
      registerPart({
        id: 'a_pillar_' + suffix.toLowerCase(), cat: 'body', name: `A 柱 ${suffix}`, en: `A-PILLAR ${suffix}`, code: `BDY-${side < 0 ? '16' : '17'}`,
        desc: 'A 柱外板与风挡密封面，采用折面过渡连接前翼子板和车顶。',
        explode: [side * 0.26, 0.48, 0.04], delay: 0.16, build: (b) => {
          b.addBeam([side * 0.744, 0.856, 0.515], [side * 0.612, 1.276, -0.085], 0.056, 0.050, 'clay', [0, 0, 1]);
          b.addBeam([side * 0.704, 0.856, 0.520], [side * 0.590, 1.258, -0.080], 0.020, 0.016, 'trim', [0, 0, 1]);
        },
      });
    }

    // C pillars
    for (const side of [-1, 1]) {
      const suffix = side < 0 ? 'L' : 'R';
      registerPart({
        id: 'c_pillar_' + suffix.toLowerCase(), cat: 'body', name: `C 柱 ${suffix}`, en: `C-PILLAR ${suffix}`, code: `BDY-${side < 0 ? '18' : '19'}`,
        desc: '宽厚 C 柱与后侧窗框，形成快背式车顶与后翼子板之间的结构连接。',
        explode: [side * 0.26, 0.55, -0.04], delay: 0.17, build: (b) => {
          b.addBeam([side * 0.604, 1.258, -0.62], [side * 0.714, 0.846, -1.34], 0.106, 0.076, 'clay', [0, 0, 1]);
          b.addBeam([side * 0.606, 1.235, -0.60], [side * 0.688, 0.863, -1.18], 0.020, 0.015, 'trim', [0, 0, 1]);
        },
      });
    }

    // trunk
    registerPart({
      id: 'trunk_lid', cat: 'body', name: '后备厢盖', en: 'BOOT LID', code: 'BDY-20',
      desc: '快背式后备厢盖，内藏尾翼安装点与排水槽。',
      explode: [0, 0.50, -0.26], delay: 0.12, build: (b) => {
        const zs = [-1.405, -1.52, -1.66, -1.80, -1.93, -2.04];
        const us = [-1, -0.72, -0.32, 0, 0.32, 0.72, 1];
        const grid = [];
        for (const z of zs) {
          const t = clamp((z + 1.405) / (-2.04 + 1.405), 0, 1);
          const hw = lerp(0.76, 0.815, t) - 0.02;
          const base = lerp(0.858, 0.744, t);
          const col = us.map((u) => [u * hw, base + 0.010 * (1 - u * u) + 0.004, z]);
          grid.push(col);
        }
        b.addClosedGrid(grid, [0, -0.038, 0], 'clay');
        b.addBeam([-0.64, 0.80, -1.67], [0.64, 0.80, -1.67], 0.035, 0.030, 'panel');
        b.addBox(0, 0.783, -1.49, 0.30, 0.035, 0.11, 'dark');
        // badge plinth
        b.addBox(0, 0.79, -1.94, 0.15, 0.012, 0.055, 'metal');
      },
    });

    // rear bumper
    registerPart({
      id: 'rear_bumper', cat: 'body', name: '后保险杠', en: 'REAR FASCIA', code: 'BDY-21',
      desc: '后保险杠蒙皮与尾部扩散器结合面，内含贯穿式尾灯安装槽。',
      explode: [0, 0.06, -0.64], delay: 0.14, build: (b) => {
        const sections = [
          { z: -2.02, half: [[0, 0.20], [0.45, 0.165], [0.72, 0.19], [0.875, 0.27], [0.90, 0.42], [0.875, 0.58], [0.79, 0.67], [0.54, 0.715], [0, 0.73]] },
          { z: -2.17, half: [[0, 0.17], [0.40, 0.145], [0.65, 0.18], [0.79, 0.26], [0.81, 0.41], [0.78, 0.55], [0.69, 0.63], [0.45, 0.675], [0, 0.69]] },
          { z: -2.28, half: [[0, 0.20], [0.30, 0.18], [0.50, 0.22], [0.61, 0.29], [0.625, 0.40], [0.59, 0.51], [0.50, 0.575], [0.30, 0.61], [0, 0.62]] },
        ];
        addLoft(b, sections.map((s) => closedProfileRing(s.half, s.z)), 'clay');
        b.addBox(0, 0.155, -2.075, 1.52, 0.035, 0.05, 'trim');
        // rear valance, number plate recess and mesh
        b.addBox(0, 0.425, -2.292, 0.94, 0.235, 0.022, 'trim');
        b.addBox(0, 0.425, -2.304, 0.46, 0.105, 0.008, 'clayLight');
        b.addBox(0, 0.425, -2.309, 0.40, 0.072, 0.004, 'clay');
        for (let i = 0; i < 5; i++) {
          b.addBox(0, 0.365 + i * 0.018, -2.305, 0.82, 0.006, 0.006, 'dark');
        }
        b.addBox(-0.56, 0.42, -2.296, 0.11, 0.055, 0.008, 'lampDark');
        b.addBox(0.56, 0.42, -2.296, 0.11, 0.055, 0.008, 'lampDark');
      },
    });

    // glazing / pillars
    for (const side of [-1, 1]) {
      const suffix = side < 0 ? 'L' : 'R';
      registerPart({
        id: 'b_pillar_' + suffix.toLowerCase(), cat: 'glazing', name: `B 柱饰板 ${suffix}`, en: `B-PILLAR TRIM ${suffix}`, code: `GLS-${side < 0 ? '01' : '02'}`,
        desc: '高光黑 B 柱饰板，分隔前门玻璃与后侧窗。',
        explode: [side * 0.36, 0.48, 0.0], delay: 0.20, build: (b) => {
          b.addBeam([side * 0.675, 0.858, -0.315], [side * 0.632, 1.236, -0.355], 0.055, 0.032, 'trim', [0, 0, 1]);
          b.addBox(side * 0.681, 0.86, -0.315, 0.015, 0.045, 0.095, 'metal');
        },
      });

      registerPart({
        id: 'mirror_' + suffix.toLowerCase(), cat: 'body', name: `后视镜 ${suffix}`, en: `WING MIRROR ${suffix}`, code: `BDY-${side < 0 ? '22' : '23'}`,
        desc: '流线型外后视镜，含镜片、底座与转向灯。可独立拆下。',
        explode: [side * 0.62, 0.26, 0.03], delay: 0.24, build: (b) => {
          b.addBeam([side * 0.775, 0.86, 0.43], [side * 0.975, 0.925, 0.365], 0.038, 0.044, 'clay');
          const m = basisMatrix([side * 1.015, 0.94, 0.34], [side, 0, 0], [0, 1, 0], [0, 0, 1]);
          b.addPrism2D([
            [-0.105, -0.045], [-0.04, -0.062], [0.075, -0.035], [0.105, 0.005],
            [0.06, 0.055], [-0.06, 0.052], [-0.105, 0.02],
          ], -0.075, 0.075, m, 'clay');
          // mirror glass
          b.addPrism2D([
            [-0.068, -0.028], [0.060, -0.020], [0.076, 0.008], [0.042, 0.036], [-0.055, 0.031],
          ], -0.081, -0.077, m, 'glassDark');
          // indicator
          b.addBox(side * 1.015, 0.902, 0.39, 0.024, 0.013, 0.09, 'lamp');
        },
      });
    }

    // side vents (behind front wheels)
    for (const side of [-1, 1]) {
      const suffix = side < 0 ? 'L' : 'R';
      registerPart({
        id: 'side_vent_' + suffix.toLowerCase(), cat: 'body', name: `侧鳃 ${suffix}`, en: `FENDER VENT ${suffix}`, code: `BDY-${side < 0 ? '24' : '25'}`,
        desc: '前轮后方的双段式导流鳃，黑色内衬与金属饰条。',
        explode: [side * 0.58, 0.07, 0.03], delay: 0.26, build: (b) => {
          const m = basisMatrix([side * 0.975, 0, 0], [0, 0, 1], [0, 1, 0], [side, 0, 0]);
          b.addPrism2D([
            [0.90, 0.475], [1.12, 0.505], [1.20, 0.665], [0.94, 0.635],
          ], 0, 0.022, m, 'trim');
          for (let i = 0; i < 2; i++) {
            const z0 = 1.00 + i * 0.065;
            b.addPrism2D([
              [z0, 0.50], [z0 + 0.035, 0.503], [z0 + 0.037, 0.62], [z0 + 0.008, 0.625],
            ], 0.024, 0.033, m, 'metal');
          }
          b.addPrism2D([
            [0.90, 0.475], [1.20, 0.665], [1.205, 0.68], [0.90, 0.49],
          ], 0.024, 0.031, m, 'clayLight');
        },
      });
    }

    // fuel filler
    registerPart({
      id: 'fuel_cap', cat: 'body', name: '加油口盖', en: 'FUEL FILLER CAP', code: 'BDY-26',
      desc: '机械式圆形加油口盖，位于右侧后翼子板。',
      explode: [0.50, 0.16, -0.05], delay: 0.28, build: (b) => {
        const x = 0.996, y = 0.725, z = -0.92;
        b.addCylinder([x - 0.002, y, z], [x + 0.014, y, z], 0.092, 0.088, 20, 'clayLight');
        b.addCylinder([x + 0.012, y, z], [x + 0.018, y, z], 0.070, 0.070, 20, 'clay');
        b.addBox(x + 0.022, y, z, 0.012, 0.025, 0.028, 'metal');
      },
    });

    // wheel house liners
    for (const axle of ['F', 'R']) {
      for (const side of [-1, 1]) {
        const zc = axle === 'F' ? D.frontAxle : D.rearAxle;
        const suffix = axle + (side < 0 ? 'L' : 'R');
        registerPart({
          id: 'wheel_well_' + suffix.toLowerCase(), cat: 'body', name: `${axle === 'F' ? '前' : '后'}轮内衬 ${side < 0 ? 'L' : 'R'}`, en: `WHEEL HOUSE ${suffix}`, code: `BDY-${27 + (axle === 'F' ? (side < 0 ? 0 : 1) : (side < 0 ? 2 : 3))}`,
          desc: '轮拱内衬，遮蔽轮胎甩水与底盘结构，深色玻纤表面。',
          explode: [side * 0.20, 0.04, 0], delay: 0.30, build: (b) => {
            const grid = [];
            const n = 12;
            for (let i = 0; i <= n; i++) {
              const th = (i / n) * Math.PI;
              const y = D.wheelY + Math.sin(th) * (D.archR + 0.020);
              const z = zc + Math.cos(th) * (D.archR + 0.020);
              const col = [];
              for (let k = 0; k < 3; k++) {
                const x = side * lerp(0.64, 0.995, k / 2);
                col.push([x, y - 0.025 * k, z]);
              }
              grid.push(col);
            }
            b.addSurfaceGrid(grid, 'dark');
            b.addBeam([side * 0.67, D.wheelY, zc - 0.42], [side * 0.67, D.wheelY, zc + 0.42], 0.04, 0.04, 'trim');
          },
        });
      }
    }

    // cowl + wipers
    registerPart({
      id: 'cowl', cat: 'body', name: '风挡下饰板', en: 'COWL VENT', code: 'BDY-31',
      desc: '风挡下缘的黑色通气格栅，集成雨刮器安装座。',
      explode: [0, 0.28, 0.35], delay: 0.22, build: (b) => {
        b.addBox(0, 0.846, 0.532, 1.49, 0.02, 0.16, 'trim');
        for (let i = 0; i < 12; i++) {
          b.addBox(-0.63 + i * 0.114, 0.859, 0.53, 0.045, 0.006, 0.13, 'dark');
        }
        b.addBox(-0.72, 0.855, 0.55, 0.045, 0.035, 0.18, 'clayDark');
        b.addBox(0.72, 0.855, 0.55, 0.045, 0.035, 0.18, 'clayDark');
      },
    });

    registerPart({
      id: 'wipers', cat: 'body', name: '雨刮器', en: 'WINDSCREEN WIPERS', code: 'BDY-32',
      desc: '双雨刮臂与刮片，停靠在风挡下缘。',
      explode: [0, 0.34, 0.42], delay: 0.24, build: (b) => {
        for (const s of [-1, 1]) {
          const x0 = s * 0.17;
          b.addBeam([x0, 0.88, 0.56], [x0 - 0.25, 0.92, 0.62], 0.018, 0.014, 'metal');
          b.addBeam([x0 - 0.25, 0.921, 0.62], [x0 - 0.47, 0.948, 0.66], 0.012, 0.010, 'trim');
          b.addBox(x0 - 0.38, 0.95, 0.64, 0.34, 0.007, 0.014, 'trim');
          b.addCylinder([x0, 0.855, 0.56], [x0, 0.883, 0.56], 0.022, 0.019, 10, 'dark');
        }
      },
    });
  }

  /* -----------------------------------------------------------------------
     GLAZING
     ----------------------------------------------------------------------- */
  function buildGlazing() {
    // windscreen
    registerPart({
      id: 'windshield', cat: 'glazing', name: '前风挡玻璃', en: 'WINDSCREEN', code: 'GLS-03',
      desc: '单片折面夹层玻璃，带吸热烟色。透视可见完整座舱。',
      explode: [0, 0.55, 0.06], delay: 0.13, pick: false, castShadow: false, build: (b) => {
        const grid = [];
        const cols = 5, rows = 6;
        for (let c = 0; c < cols; c++) {
          const t = c / (cols - 1);
          const z = lerp(0.535, -0.095, t);
          const y = lerp(0.865, 1.262, t);
          const hw = lerp(0.735, 0.605, t);
          const col = [];
          for (let r = 0; r < rows; r++) {
            const u = -1 + (r / (rows - 1)) * 2;
            col.push([u * hw, y - 0.010 * Math.abs(u), z + 0.013 * (1 - u * u)]);
          }
          grid.push(col);
        }
        b.addSurfaceGrid(grid, 'glass');
      },
    });

    // side glass — front door and rear quarter
    for (const side of [-1, 1]) {
      const suffix = side < 0 ? 'L' : 'R';
      registerPart({
        id: 'side_glass_front_' + suffix.toLowerCase(), cat: 'glazing', name: `前门玻璃 ${suffix}`, en: `DOOR GLASS ${suffix}`, code: `GLS-${side < 0 ? '04' : '05'}`,
        desc: '无框前门玻璃，双曲面折面造型。',
        explode: [side * 0.46, 0.48, 0.02], delay: 0.19, pick: false, castShadow: false, build: (b) => {
          b.addPolygon3D([
            [side * 0.745, 0.876, 0.47],
            [side * 0.710, 1.055, 0.20],
            [side * 0.632, 1.244, -0.10],
            [side * 0.626, 1.240, -0.315],
            [side * 0.690, 0.882, -0.315],
          ], 'glass');
        },
      });
      registerPart({
        id: 'side_glass_rear_' + suffix.toLowerCase(), cat: 'glazing', name: `后侧窗玻璃 ${suffix}`, en: `QUARTER GLASS ${suffix}`, code: `GLS-${side < 0 ? '06' : '07'}`,
        desc: '后三角窗玻璃，随 C 柱内收。',
        explode: [side * 0.43, 0.50, -0.03], delay: 0.21, pick: false, castShadow: false, build: (b) => {
          b.addPolygon3D([
            [side * 0.688, 0.884, -0.352],
            [side * 0.632, 1.225, -0.365],
            [side * 0.638, 1.178, -0.62],
            [side * 0.673, 1.035, -0.96],
            [side * 0.720, 0.886, -1.11],
          ], 'glass');
        },
      });
    }

    // rear screen
    registerPart({
      id: 'rear_glass', cat: 'glazing', name: '后风挡玻璃', en: 'REAR SCREEN', code: 'GLS-08',
      desc: '快背式后风挡，内嵌除霜加热丝。',
      explode: [0, 0.56, -0.12], delay: 0.14, pick: false, castShadow: false, build: (b) => {
        const grid = [];
        const cols = 4, rows = 6;
        for (let c = 0; c < cols; c++) {
          const t = c / (cols - 1);
          const z = lerp(-0.715, -1.395, t);
          const y = lerp(1.255, 0.865, t);
          const hw = lerp(0.592, 0.735, t);
          const col = [];
          for (let r = 0; r < rows; r++) {
            const u = -1 + (r / (rows - 1)) * 2;
            col.push([u * hw, y - 0.006 * Math.abs(u), z]);
          }
          grid.push(col);
        }
        b.addSurfaceGrid(grid, 'glass');
      },
    });

    // window seals
    registerPart({
      id: 'glass_seals', cat: 'glazing', name: '玻璃密封条', en: 'GLASS SEALS', code: 'GLS-09',
      desc: '前风挡、侧窗及后窗四周的黑色橡胶密封条。',
      explode: [0, 0.48, 0], delay: 0.23, castShadow: false, build: (b) => {
        const ws = [];
        for (let i = 0; i <= 8; i++) {
          const t = i / 8;
          ws.push([lerp(-0.735, 0.735, t), 0.872 - 0.010 * Math.abs(lerp(-1, 1, t)), 0.535 + 0.013 * (1 - Math.pow(lerp(-1, 1, t), 2))]);
        }
        b.addPolylineTube(ws, 0.014, 6, 'trim');
        for (const side of [-1, 1]) {
          b.addPolylineTube([
            [side * 0.754, 0.870, 0.485], [side * 0.720, 1.06, 0.20],
            [side * 0.640, 1.255, -0.10], [side * 0.633, 1.249, -0.33],
            [side * 0.699, 0.876, -0.34], [side * 0.754, 0.870, 0.485],
          ], 0.012, 6, 'trim');
          b.addPolylineTube([
            [side * 0.697, 0.878, -0.36], [side * 0.639, 1.235, -0.37],
            [side * 0.648, 1.185, -0.63], [side * 0.680, 1.040, -0.97],
            [side * 0.727, 0.881, -1.12], [side * 0.697, 0.878, -0.36],
          ], 0.011, 6, 'trim');
        }
        const rg = [];
        for (let i = 0; i <= 8; i++) {
          const t = i / 8;
          const u = lerp(-1, 1, t);
          rg.push([u * 0.735, 0.866 - 0.006 * Math.abs(u), -1.395]);
        }
        b.addPolylineTube(rg, 0.013, 6, 'trim');
      },
    });
  }

  /* -----------------------------------------------------------------------
     LIGHTING / GRILLE
     ----------------------------------------------------------------------- */
  function buildLighting() {
    for (const side of [-1, 1]) {
      const suffix = side < 0 ? 'L' : 'R';
      registerPart({
        id: 'headlamp_' + suffix.toLowerCase(), cat: 'lighting', name: `前大灯 ${suffix}`, en: `HEADLAMP ${suffix}`, code: `LGT-${side < 0 ? '01' : '02'}`,
        desc: '矩阵式 LED 前大灯：折面灯腔、三透镜、日行灯带与冷却鳍片。',
        explode: [side * 0.40, 0.34, 0.46], delay: 0.26, build: (b) => {
          const m = M4.multiply(
            M4.translation(side * 0.600, 0.612, 2.165),
            M4.rotation([0, 1, 0], side * 0.17)
          );
          const pts = [
            [-0.172, -0.045], [0.158, -0.061], [0.190, 0.016], [0.140, 0.062], [-0.132, 0.070], [-0.192, 0.022],
          ];
          b.addPrism2D(pts, 0, 0.052, m, 'clay');
          // inner black cavity
          const inner = pts.map(([x, y]) => [x * 0.86, y * 0.76]);
          b.addPrism2D(inner, 0.053, 0.058, m, 'trim');
          // projectors
          for (let i = 0; i < 3; i++) {
            const local = [0.070 + i * 0.039, -0.007 - i * 0.003, 0.059];
            const p0 = M4.transformPoint(m, local);
            const p1 = M4.transformPoint(m, [local[0], local[1], 0.064]);
            b.addCylinder(p0, p1, 0.027, 0.027, 14, 'lampDark');
            b.addCylinder(p1, M4.transformPoint(m, [local[0], local[1], 0.067]), 0.018, 0.018, 14, 'lamp');
          }
          // DRL
          const drl0 = M4.transformPoint(m, [-0.155, 0.040, 0.062]);
          const drl1 = M4.transformPoint(m, [0.118, 0.033, 0.062]);
          b.addBeam(drl0, drl1, 0.016, 0.007, 'lamp');
          // flush smoked lens
          b.addPrism2D(pts, 0.058, 0.062, m, 'lampDark');
        },
      });
    }

    registerPart({
      id: 'grille', cat: 'lighting', name: '前格栅与车标', en: 'GRILLE / BADGE', code: 'LGT-03',
      desc: '中央深色蜂窝格栅、五道横向翼片与立体三角车标。',
      explode: [0, 0.12, 0.71], delay: 0.28, build: (b) => {
        const m = basisMatrix([0, 0, 2.315], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
        b.addPrism2D([
          [-0.40, 0.25], [-0.46, 0.34], [-0.38, 0.49], [0.38, 0.49],
          [0.46, 0.34], [0.40, 0.25],
        ], 0, 0.014, m, 'trim');
        for (let i = 0; i < 5; i++) {
          const y = 0.275 + i * 0.042;
          b.addBox(0, y, 2.332, 0.64 - Math.abs(i - 2) * 0.035, 0.011, 0.018, 'dark');
        }
        b.addBox(0, 0.36, 2.336, 0.012, 0.20, 0.012, 'metal');
        // badge
        b.addPrism2D([
          [-0.060, 0.367], [0.060, 0.367], [0.000, 0.468],
        ], 0.004, 0.020, m, 'metal');
        b.addPrism2D([
          [-0.035, 0.381], [0.035, 0.381], [0.000, 0.440],
        ], 0.020, 0.023, m, 'clayLight');
      },
    });

    for (const side of [-1, 1]) {
      const suffix = side < 0 ? 'L' : 'R';
      registerPart({
        id: 'side_intake_' + suffix.toLowerCase(), cat: 'lighting', name: `前侧进气口 ${suffix}`, en: `FRONT INTAKE ${suffix}`, code: `LGT-${side < 0 ? '04' : '05'}`,
        desc: '前保险杠侧向进气口，三层导流叶片。',
        explode: [side * 0.45, 0.02, 0.60], delay: 0.29, build: (b) => {
          const m = M4.multiply(
            M4.translation(side * 0.585, 0.305, 2.285),
            M4.rotation([0, 1, 0], side * 0.20)
          );
          b.addPrism2D([
            [-0.13, -0.075], [0.14, -0.060], [0.17, 0.055], [-0.10, 0.075],
          ], 0, 0.016, m, 'trim');
          for (let i = 0; i < 3; i++) {
            const p0 = M4.transformPoint(m, [-0.10 + i * 0.09, -0.050, 0.020]);
            const p1 = M4.transformPoint(m, [-0.10 + i * 0.09, 0.055, 0.020]);
            b.addBeam(p0, p1, 0.018, 0.011, 'clayDark');
          }
          b.addPrism2D([
            [-0.13, -0.075], [0.14, -0.060], [0.17, 0.055], [-0.10, 0.075],
          ], 0.017, 0.020, m, 'trim');
        },
      });
    }

    // full-width tail lamp
    registerPart({
      id: 'taillight', cat: 'lighting', name: '贯穿式尾灯', en: 'FULL-WIDTH TAIL LAMP', code: 'LGT-06',
      desc: '贯穿式尾灯，含 18 段 LED 发光单元、深色灯腔与倒车灯。',
      explode: [0, 0.12, -0.68], delay: 0.25, build: (b) => {
        b.addBox(0, 0.655, -2.290, 1.48, 0.068, 0.026, 'trim');
        for (let i = 0; i < 18; i++) {
          const x = -0.65 + i * (1.30 / 17);
          b.addBox(x, 0.664, -2.305, 0.056, 0.017, 0.008, 'lamp');
        }
        b.addBox(0, 0.655, -2.305, 0.028, 0.031, 0.009, 'metal');
        b.addBox(-0.585, 0.624, -2.305, 0.052, 0.015, 0.008, 'lampDark');
        b.addBox(0.585, 0.624, -2.305, 0.052, 0.015, 0.008, 'lampDark');
        // rear badge
        b.addPrism2D([
          [-0.040, 0.700], [0.040, 0.700], [0, 0.758],
        ], 0, 0.012, basisMatrix([0, 0, -2.295], [1, 0, 0], [0, 1, 0], [0, 0, -1]), 'metal');
      },
    });
  }

  /* -----------------------------------------------------------------------
     WHEELS / BRAKES
     ----------------------------------------------------------------------- */
  function wheelSet(side, axle) {
    const isFront = axle === 'F';
    const zc = isFront ? D.frontAxle : D.rearAxle;
    const suffix = (isFront ? '前' : '后') + (side < 0 ? '左' : '右');
    const suffixEn = axle + (side < 0 ? 'L' : 'R');
    const center = [side * D.wheelX, D.wheelY, zc];
    const axis = [side, 0, 0];
    const codeBase = isFront ? (side < 0 ? 1 : 2) : (side < 0 ? 3 : 4);

    registerPart({
      id: 'tire_' + suffixEn.toLowerCase(), cat: 'wheels', name: `${suffix}轮胎`, en: `${suffixEn} TYRE`, code: `WHL-${codeBase * 3 - 2}`,
      desc: '285/35 R20 高性能轮胎，折面胎壁与两排错位胎块。',
      explode: [side * 0.82, -0.04, 0], delay: 0.08, build: (b) => {
        const profile = [
          [-0.150, 0.252], [-0.163, 0.300], [-0.150, 0.348], [-0.092, 0.372],
          [0.092, 0.372], [0.150, 0.348], [0.163, 0.300], [0.150, 0.252],
          [0.102, 0.233], [-0.102, 0.233],
        ];
        b.addRevolveAxis(center, axis, profile, 28, 'rubber');
        for (let i = 0; i < 26; i++) {
          const th = (i / 26) * Math.PI * 2;
          const radial = [0, Math.cos(th), Math.sin(th)];
          const tangent = [0, -Math.sin(th), Math.cos(th)];
          for (const a of [-0.062, 0.062]) {
            const pos = add(add(center, mul(axis, a)), mul(radial, 0.374));
            b.addOrientedBox(pos, radial, tangent, axis, 0.007, 0.030, 0.028, 'rubber');
          }
        }
        // rim protector bead
        b.addRevolveAxis(center, axis, [
          [0.155, 0.292], [0.170, 0.296], [0.170, 0.315], [0.155, 0.311],
        ], 28, 'dark');
      },
    });

    registerPart({
      id: 'rim_' + suffixEn.toLowerCase(), cat: 'wheels', name: `${suffix}轮毂`, en: `${suffixEn} FORGED WHEEL`, code: `WHL-${codeBase * 3 - 1}`,
      desc: '20 英寸锻造轮毂，十辐涡轮造型、中心锁盖与五颗轮毂螺栓。',
      explode: [side * 0.95, -0.04, 0], delay: 0.13, build: (b) => {
        const a0 = add(center, mul(axis, -0.10));
        const a1 = add(center, mul(axis, 0.075));
        const a2 = add(center, mul(axis, 0.112));
        b.addTube(a0, a1, 0.245, 0.218, 28, 'dark');
        b.addTube(a1, a2, 0.258, 0.238, 28, 'metal');
        for (let i = 0; i < 10; i++) {
          const th = (i / 10) * Math.PI * 2;
          const radial = [0, Math.cos(th), Math.sin(th)];
          const tangent = [0, -Math.sin(th), Math.cos(th)];
          const pos = add(add(center, mul(axis, 0.070)), mul(radial, 0.154));
          b.addOrientedBox(pos, radial, tangent, axis, 0.092, 0.017, 0.026, 'metal');
          // darker slot between spokes
          const slot = add(add(center, mul(axis, 0.045)), mul(radial, 0.165));
          b.addOrientedBox(slot, radial, tangent, axis, 0.073, 0.009, 0.012, 'dark');
        }
        const hubA = add(center, mul(axis, 0.055));
        const hubB = add(center, mul(axis, 0.128));
        b.addCylinder(hubA, hubB, 0.060, 0.052, 20, 'metal');
        b.addCylinder(hubB, add(center, mul(axis, 0.142)), 0.046, 0.038, 20, 'clayDark');
        // lugs
        for (let i = 0; i < 5; i++) {
          const th = (i / 5) * Math.PI * 2 + 0.3;
          const p = add(add(center, mul(axis, 0.132)), [0, Math.cos(th) * 0.085, Math.sin(th) * 0.085]);
          b.addCylinder(p, add(p, mul(axis, 0.012)), 0.012, 0.012, 6, 'steel');
        }
      },
    });

    registerPart({
      id: 'brake_' + suffixEn.toLowerCase(), cat: 'wheels', name: `${suffix}制动总成`, en: `${suffixEn} BRAKE ASSEMBLY`, code: `WHL-${codeBase * 3}`,
      desc: '钻孔通风制动盘与六活塞卡钳，卡钳随车轮拆解显露。',
      explode: [side * 0.62, -0.02, 0], delay: 0.05, build: (b) => {
        const d0 = add(center, mul(axis, -0.012));
        const d1 = add(center, mul(axis, 0.025));
        b.addCylinder(d0, d1, 0.192, 0.192, 28, 'brake');
        b.addCylinder(d1, add(center, mul(axis, 0.082)), 0.074, 0.074, 18, 'steel');
        for (let i = 0; i < 14; i++) {
          const th = (i / 14) * Math.PI * 2;
          const p = add(center, [0, Math.cos(th) * 0.150, Math.sin(th) * 0.150]);
          b.addCylinder(add(p, mul(axis, 0.024)), add(p, mul(axis, 0.028)), 0.0085, 0.0085, 6, 'trim');
        }
        const th = Math.PI * 0.70;
        const radial = [0, Math.cos(th), Math.sin(th)];
        const tangent = [0, -Math.sin(th), Math.cos(th)];
        const cal = add(add(center, mul(radial, 0.164)), mul(axis, 0.010));
        b.addOrientedBox(cal, radial, tangent, axis, 0.055, 0.060, 0.048, 'clayDark');
        b.addOrientedBox(add(cal, mul(tangent, 0.052)), radial, tangent, axis, 0.042, 0.016, 0.043, 'metal');
      },
    });
  }

  /* -----------------------------------------------------------------------
     SUSPENSION
     ----------------------------------------------------------------------- */
  function buildSuspension() {
    for (const axle of ['F', 'R']) {
      for (const side of [-1, 1]) {
        const suffix = axle + (side < 0 ? 'L' : 'R');
        const zc = axle === 'F' ? D.frontAxle : D.rearAxle;
        registerPart({
          id: 'suspension_' + suffix.toLowerCase(), cat: 'chassis', name: `${axle === 'F' ? '前' : '后'}悬挂 ${side < 0 ? 'L' : 'R'}`, en: `${suffix} SUSPENSION`, code: `CHS-${(axle === 'F' ? 1 : 3) + (side > 0 ? 1 : 0)}`,
          desc: '双叉臂 / 多连杆悬挂、轮毂轴承座、减振器与螺旋弹簧。拆下车轮后可见。',
          explode: [side * 0.34, -0.08, 0], delay: 0.02, build: (b) => {
            const xIn = side * 0.53;
            const xOut = side * D.wheelX;
            b.addBeam([xIn, 0.47, zc - 0.10], [xOut, 0.40, zc], 0.055, 0.045, 'metal');
            b.addBeam([xIn, 0.28, zc - 0.10], [xOut, 0.33, zc], 0.065, 0.050, 'metal');
            b.addBeam([xIn, 0.40, zc + 0.10], [xOut, 0.37, zc], 0.040, 0.035, 'steel');
            b.addBeam([xOut, 0.20, zc - 0.055], [xOut, 0.55, zc - 0.055], 0.060, 0.075, 'steel');
            b.addBeam([side * 0.58, 0.33, zc - 0.07], [side * 0.79, 0.33, zc - 0.01], 0.035, 0.028, 'metal');
            b.addCylinder([side * 0.64, 0.27, zc - 0.06], [side * 0.68, 0.66, zc - 0.05], 0.023, 0.020, 10, 'steel');
            b.addHelix([side * 0.66, 0.48, zc - 0.055], [0, 1, 0], 0.050, 0.34, 5.5, 0.010, 10, 'clayDark');
          },
        });
      }
    }
  }

  /* -----------------------------------------------------------------------
     CHASSIS / EXHAUST
     ----------------------------------------------------------------------- */
  function buildChassis() {
    registerPart({
      id: 'underbody', cat: 'chassis', name: '底盘护板', en: 'UNDERTRAY / CHASSIS', code: 'CHS-05',
      desc: '平整化底盘、前后副车架、中央传动通道与油箱。拆解时下沉露出机械结构。',
      explode: [0, -0.52, 0], delay: 0.06, build: (b) => {
        b.addBox(0, 0.205, 0.0, 1.44, 0.07, 3.30, 'dark');
        b.addBox(-0.52, 0.245, 0.0, 0.09, 0.10, 3.68, 'steel');
        b.addBox(0.52, 0.245, 0.0, 0.09, 0.10, 3.68, 'steel');
        b.addBox(0, 0.27, 1.98, 1.18, 0.08, 0.15, 'steel');
        b.addBox(0, 0.27, -1.90, 1.18, 0.08, 0.15, 'steel');
        b.addBox(0, 0.245, -0.75, 0.34, 0.10, 1.10, 'steel');
        b.addBox(0, 0.32, -1.22, 0.72, 0.22, 0.50, 'dark');
        b.addBox(0, 0.36, 0.98, 0.34, 0.16, 0.42, 'metal');
        b.addBeam([-0.72, 0.17, 1.78], [0.72, 0.17, 1.78], 0.07, 0.04, 'trim');
        b.addBeam([-0.76, 0.17, -1.86], [0.76, 0.17, -1.86], 0.07, 0.04, 'trim');
        b.addBox(0, 0.32, -0.12, 0.42, 0.15, 0.52, 'metal');
        b.addCylinder([0, 0.33, 0.32], [0, 0.33, -1.06], 0.032, 0.032, 12, 'metal');
      },
    });

    registerPart({
      id: 'exhaust', cat: 'powertrain', name: '排气系统', en: 'EXHAUST SYSTEM', code: 'PWR-05',
      desc: '等长排气歧管、双中段与尾段消声器。',
      explode: [0, -0.20, 0.10], delay: 0.07, build: (b) => {
        for (const s of [-1, 1]) {
          b.addPolylineTube([
            [s * 0.28, 0.45, 1.72], [s * 0.34, 0.30, 1.52], [s * 0.32, 0.215, 0.95],
            [s * 0.28, 0.195, 0.10], [s * 0.26, 0.20, -0.90], [s * 0.30, 0.22, -1.62],
          ], 0.032, 8, 'metal');
          b.addBox(s * 0.29, 0.22, -1.73, 0.20, 0.13, 0.34, 'steel');
          b.addCylinder([s * 0.29, 0.215, -1.90], [s * 0.29, 0.215, -2.32], 0.052, 0.052, 14, 'metal');
          b.addTube([s * 0.29, 0.215, -2.31], [s * 0.29, 0.215, -2.35], 0.054, 0.044, 14, 'trim');
        }
      },
    });

    registerPart({
      id: 'rear_diffuser', cat: 'aero', name: '后扩散器', en: 'REAR DIFFUSER', code: 'AER-02',
      desc: '带七道导流鳍片的深色后扩散器，从后保险杠下方抽出。',
      explode: [0, -0.14, -0.38], delay: 0.18, build: (b) => {
        const m = basisMatrix([0, 0.12, 0], [1, 0, 0], [0, 0, 1], [0, 1, 0]);
        b.addPrism2D([
          [-0.76, -2.04], [0.76, -2.04], [0.68, -2.31], [0.30, -2.35],
          [-0.30, -2.35], [-0.68, -2.31],
        ], 0, 0.055, m, 'dark');
        for (let i = 0; i < 7; i++) {
          const x = -0.50 + i * 0.167;
          b.addBeam([x, 0.155, -2.07], [x, 0.185, -2.32], 0.014, 0.095, 'trim');
        }
      },
    });

    registerPart({
      id: 'rear_wing', cat: 'aero', name: '主动式尾翼', en: 'ACTIVE REAR WING', code: 'AER-03',
      desc: '低矮主动尾翼，双支座与端板。可独立拆卸或升起。',
      explode: [0, 0.55, -0.12], delay: 0.20, build: (b) => {
        const m = basisMatrix([-0.74, 0.875, -2.03], [0, 0, 1], [0, 1, 0], [1, 0, 0]);
        b.addPrism2D([
          [0, 0], [0.055, 0.035], [0.185, 0.040], [0.218, 0.012], [0.175, -0.010], [0.018, -0.012],
        ], 0, 1.48, m, 'dark');
        b.addBox(-0.735, 0.915, -1.93, 0.018, 0.12, 0.24, 'trim');
        b.addBox(0.735, 0.915, -1.93, 0.018, 0.12, 0.24, 'trim');
        b.addBeam([-0.48, 0.79, -1.97], [-0.48, 0.895, -1.98], 0.05, 0.04, 'metal');
        b.addBeam([0.48, 0.79, -1.97], [0.48, 0.895, -1.98], 0.05, 0.04, 'metal');
      },
    });
  }

  /* -----------------------------------------------------------------------
     POWERTRAIN
     ----------------------------------------------------------------------- */
  function buildPowertrain() {
    registerPart({
      id: 'engine', cat: 'powertrain', name: 'V8 发动机', en: 'V8 ENGINE', code: 'PWR-01',
      desc: '前中置 4.0 升双涡轮 V8，含缸体、缸头、进气歧管、前端轮系与机脚。',
      explode: [0, 0.58, 0.16], delay: 0.05, build: (b) => {
        b.addBox(0, 0.420, 1.56, 0.50, 0.27, 0.55, 'steel');
        for (const s of [-1, 1]) {
          b.addBox(s * 0.205, 0.560, 1.56, 0.235, 0.13, 0.53, 'metal');
          b.addBox(s * 0.205, 0.632, 1.56, 0.215, 0.045, 0.46, 'clayDark');
          for (let i = 0; i < 4; i++) {
            b.addBox(s * 0.205, 0.657, 1.395 + i * 0.11, 0.185, 0.012, 0.035, 'trim');
          }
        }
        b.addBox(0, 0.690, 1.56, 0.19, 0.055, 0.44, 'metal');
        for (let i = 0; i < 8; i++) {
          const s = i < 4 ? -1 : 1;
          const idx = i % 4;
          b.addCylinder([s * 0.09, 0.695, 1.40 + idx * 0.10], [s * 0.18, 0.585, 1.40 + idx * 0.10], 0.022, 0.018, 8, 'metal');
        }
        // front pulley drive
        for (let i = 0; i < 4; i++) {
          const x = -0.15 + i * 0.10;
          b.addCylinder([x, 0.40 - (i % 2) * 0.055, 1.842], [x, 0.40 - (i % 2) * 0.055, 1.872], 0.042 + (i === 0 ? 0.042 : 0), 0.042, 14, 'metal');
        }
        b.addBox(0, 0.43, 1.855, 0.42, 0.04, 0.035, 'dark');
        // engine mounts
        b.addBox(-0.33, 0.36, 1.52, 0.12, 0.10, 0.12, 'dark');
        b.addBox(0.33, 0.36, 1.52, 0.12, 0.10, 0.12, 'dark');
        // airbox
        b.addBox(-0.46, 0.565, 1.68, 0.27, 0.17, 0.36, 'dark');
        b.addBox(-0.46, 0.650, 1.68, 0.22, 0.018, 0.30, 'trim');
        b.addCylinder([-0.33, 0.62, 1.68], [-0.16, 0.67, 1.56], 0.035, 0.030, 10, 'trim');
      },
    });

    registerPart({
      id: 'radiator', cat: 'powertrain', name: '散热器总成', en: 'RADIATOR PACK', code: 'PWR-02',
      desc: '前舱散热器、冷凝器与双冷却风扇。',
      explode: [0, 0.12, 0.72], delay: 0.08, build: (b) => {
        b.addBox(0, 0.455, 2.010, 1.14, 0.32, 0.055, 'steel');
        for (let i = 0; i < 14; i++) {
          b.addBox(0, 0.315 + i * 0.021, 2.042, 1.05, 0.007, 0.014, 'metal');
        }
        for (const s of [-1, 1]) {
          b.addCylinder([s * 0.31, 0.46, 2.06], [s * 0.31, 0.46, 2.09], 0.115, 0.115, 16, 'dark');
          b.addBox(s * 0.31, 0.46, 2.095, 0.15, 0.035, 0.012, 'trim');
        }
        b.addBox(0, 0.64, 2.02, 1.10, 0.035, 0.08, 'clayDark');
      },
    });

    registerPart({
      id: 'strut_brace', cat: 'powertrain', name: '前顶吧', en: 'FRONT STRUT BRACE', code: 'PWR-03',
      desc: '铝合金前塔顶加强杆，连接左右减振器座。',
      explode: [0, 0.42, 0.05], delay: 0.12, build: (b) => {
        b.addPolylineTube([[-0.62, 0.745, 1.17], [-0.25, 0.775, 1.22], [0.25, 0.775, 1.22], [0.62, 0.745, 1.17]], 0.024, 8, 'metal');
        b.addBox(-0.62, 0.71, 1.17, 0.16, 0.06, 0.16, 'steel');
        b.addBox(0.62, 0.71, 1.17, 0.16, 0.06, 0.16, 'steel');
      },
    });
  }

  /* -----------------------------------------------------------------------
     INTERIOR
     ----------------------------------------------------------------------- */
  function buildInterior() {
    registerPart({
      id: 'dashboard', cat: 'interior', name: '仪表台', en: 'DASHBOARD', code: 'INT-01',
      desc: '横向折面仪表台，集成数字仪表、中央触控屏与隐藏式出风口。',
      explode: [0, 0.42, 0.05], delay: 0.12, build: (b) => {
        b.addBox(0, 0.665, 0.38, 1.32, 0.17, 0.26, 'interior');
        b.addPrism2D([
          [-0.66, 0.73], [0.66, 0.73], [0.62, 0.80], [0.31, 0.835], [-0.36, 0.835], [-0.66, 0.79],
        ], 0.30, 0.48, basisMatrix([0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]), 'clayDark');
        // driver display
        b.addBox(-0.36, 0.772, 0.278, 0.30, 0.105, 0.018, 'dark');
        b.addBox(-0.36, 0.772, 0.268, 0.265, 0.080, 0.008, 'lampDark');
        // centre screen
        b.addBox(0.02, 0.745, 0.286, 0.30, 0.155, 0.020, 'dark');
        b.addBox(0.02, 0.745, 0.274, 0.265, 0.125, 0.008, 'lampDark');
        // vents
        for (let i = 0; i < 3; i++) {
          b.addBox(-0.53 + i * 0.23, 0.708, 0.253, 0.16, 0.036, 0.022, 'trim');
          b.addBox(-0.53 + i * 0.23, 0.708, 0.245, 0.13, 0.020, 0.006, 'metal');
        }
        // passenger trim
        b.addBeam([0.28, 0.718, 0.26], [0.58, 0.75, 0.37], 0.035, 0.010, 'metal');
      },
    });

    registerPart({
      id: 'steering_wheel', cat: 'interior', name: '方向盘', en: 'STEERING WHEEL', code: 'INT-02',
      desc: '三辐式平底方向盘，带换挡拨片与中心喇叭盖。',
      explode: [-0.18, 0.44, 0.03], delay: 0.15, build: (b) => {
        const center = [-0.36, 0.735, 0.205];
        const axis = normalize([0, 0.28, -1]);
        b.addTorus(center, axis, 0.158, 0.022, 22, 6, 'fabric');
        // hub
        b.addCylinder(add(center, mul(axis, -0.02)), add(center, mul(axis, 0.035)), 0.058, 0.048, 18, 'dark');
        // spokes
        const u = [1, 0, 0];
        const v = normalize(cross(axis, u));
        for (const th of [0.15, Math.PI - 0.15, Math.PI * 0.5]) {
          const ring = add(center, add(mul(u, Math.cos(th) * 0.142), mul(v, Math.sin(th) * 0.142)));
          b.addBeam(center, ring, 0.032, 0.020, 'metal');
        }
        b.addCylinder(add(center, mul(axis, 0.04)), add(center, mul(axis, -0.08)), 0.045, 0.036, 12, 'trim');
        // column
        b.addCylinder([-0.36, 0.73, 0.265], [-0.36, 0.72, 0.45], 0.030, 0.034, 10, 'dark');
      },
    });

    for (const side of [-1, 1]) {
      const suffix = side < 0 ? 'L' : 'R';
      registerPart({
        id: 'seat_' + suffix.toLowerCase(), cat: 'interior', name: `运动座椅 ${suffix}`, en: `SPORT SEAT ${suffix}`, code: `INT-${side < 0 ? '03' : '04'}`,
        desc: '一体式桶形运动座椅，带侧向支撑、头枕与座椅滑轨。',
        explode: [side * 0.10, 0.36, -0.06], delay: 0.18, build: (b) => {
          const x = side * 0.36;
          b.addBox(x, 0.455, -0.145, 0.44, 0.10, 0.55, 'fabric');
          b.addBeam([x, 0.505, -0.23], [x, 0.535, -0.39], 0.44, 0.14, 'fabric');
          b.addBeam([x, 0.545, -0.35], [x, 0.985, -0.57], 0.42, 0.145, 'fabric', [0, 1, 0]);
          b.addBeam([x - side * 0.185, 0.50, -0.31], [x - side * 0.185, 0.94, -0.54], 0.06, 0.18, 'fabric', [0, 1, 0]);
          b.addBeam([x + side * 0.185, 0.50, -0.31], [x + side * 0.185, 0.94, -0.54], 0.06, 0.18, 'fabric', [0, 1, 0]);
          b.addBox(x, 1.035, -0.585, 0.285, 0.135, 0.13, 'fabric');
          b.addBox(x, 0.397, -0.15, 0.37, 0.075, 0.49, 'dark');
          b.addBeam([x - 0.16, 0.36, -0.40], [x - 0.16, 0.36, 0.13], 0.035, 0.035, 'metal');
          b.addBeam([x + 0.16, 0.36, -0.40], [x + 0.16, 0.36, 0.13], 0.035, 0.035, 'metal');
        },
      });
    }

    registerPart({
      id: 'center_console', cat: 'interior', name: '中央通道', en: 'CENTRE CONSOLE', code: 'INT-05',
      desc: '中央通道、短行程换挡杆、杯架与扶手。',
      explode: [0, 0.32, -0.02], delay: 0.14, build: (b) => {
        b.addBox(0, 0.455, -0.10, 0.31, 0.16, 0.74, 'interior');
        b.addBox(0, 0.555, -0.28, 0.29, 0.06, 0.25, 'fabric');
        b.addBox(0, 0.503, 0.15, 0.20, 0.035, 0.22, 'dark');
        b.addCylinder([0, 0.50, 0.15], [0, 0.585, 0.15], 0.020, 0.026, 8, 'metal');
        b.addBox(0, 0.588, 0.15, 0.055, 0.035, 0.075, 'trim');
        for (const s of [-1, 1]) {
          b.addCylinder([s * 0.075, 0.512, -0.02], [s * 0.075, 0.518, -0.02], 0.044, 0.044, 14, 'dark');
        }
      },
    });

    registerPart({
      id: 'pedals', cat: 'interior', name: '踏板组', en: 'PEDAL BOX', code: 'INT-06',
      desc: '铝合金制动与油门踏板，位于驾驶员脚坑。',
      explode: [0, 0.28, 0.18], delay: 0.16, build: (b) => {
        for (let i = 0; i < 3; i++) {
          b.addBox(-0.53 + i * 0.10, 0.30, 0.52, 0.075, 0.12, 0.025, 'metal', M4.rotation([1, 0, 0], -0.35));
        }
        b.addBeam([-0.44, 0.27, 0.54], [-0.44, 0.34, 0.46], 0.12, 0.025, 'trim');
      },
    });

    registerPart({
      id: 'rear_view_mirror', cat: 'interior', name: '车内后视镜', en: 'INTERIOR MIRROR', code: 'INT-07',
      desc: '无框车内后视镜与风挡安装座。',
      explode: [0, 0.54, 0.12], delay: 0.17, build: (b) => {
        b.addBeam([0, 1.235, 0.09], [0, 1.185, 0.03], 0.025, 0.030, 'trim');
        b.addBox(0, 1.175, 0.02, 0.26, 0.075, 0.035, 'dark');
        b.addBox(0, 1.172, 0.006, 0.235, 0.060, 0.010, 'lampDark');
      },
    });
  }

  /* -----------------------------------------------------------------------
     FINAL ASSEMBLY
     ----------------------------------------------------------------------- */
  function buildWheels() {
    wheelSet(-1, 'F');
    wheelSet(1, 'F');
    wheelSet(-1, 'R');
    wheelSet(1, 'R');
  }

  function init() {
    buildBody();
    buildGlazing();
    buildLighting();
    buildWheels();
    buildSuspension();
    buildChassis();
    buildPowertrain();
    buildInterior();

    CAR.stats = {
      parts: CAR.parts.length,
      triangles: CAR.parts.reduce((s, p) => s + p.triCount, 0),
      materials: new Set(CAR.parts.flatMap((p) => p.mats)).size,
    };
    console.info('[AURELIS GT] assembled', CAR.stats);
  }

  init();
})();
