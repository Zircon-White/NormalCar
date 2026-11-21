/* =========================================================================
   FORM / 01 — geometry toolkit
   Column-major mat4, flat-shaded mesh builder and faceting utilities.
   No external dependencies.
   ========================================================================= */
(function () {
  'use strict';

  const G = (window.G = {});

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (a, b, x) => {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const mod = (a, n) => ((a % n) + n) % n;

  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const len = (a) => Math.hypot(a[0], a[1], a[2]);
  const normalize = (a) => {
    const l = len(a) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  };
  const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const average = (pts) => {
    const p = [0, 0, 0];
    pts.forEach((q) => { p[0] += q[0]; p[1] += q[1]; p[2] += q[2]; });
    return mul(p, 1 / Math.max(pts.length, 1));
  };

  Object.assign(G, { clamp, lerp, smoothstep, mod, add, sub, mul, dot, cross, len, normalize, mix3, average });

  /* ---------------------------------------------------------------------
     mat4 (column-major array)
     --------------------------------------------------------------------- */
  const M4 = {
    identity() {
      return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    },
    multiply(a, b) {
      const o = new Array(16);
      for (let c = 0; c < 4; c++) {
        for (let r = 0; r < 4; r++) {
          o[c * 4 + r] =
            a[r] * b[c * 4] +
            a[4 + r] * b[c * 4 + 1] +
            a[8 + r] * b[c * 4 + 2] +
            a[12 + r] * b[c * 4 + 3];
        }
      }
      return o;
    },
    chain(...mats) {
      return mats.reduce((acc, m) => M4.multiply(acc, m), M4.identity());
    },
    translation(x, y, z) {
      const m = M4.identity();
      m[12] = x; m[13] = y; m[14] = z;
      return m;
    },
    scale(x, y, z) {
      const m = M4.identity();
      m[0] = x; m[5] = y; m[10] = z;
      return m;
    },
    rotation(axis, angle) {
      const a = normalize(axis);
      const c = Math.cos(angle), s = Math.sin(angle), t = 1 - c;
      const x = a[0], y = a[1], z = a[2];
      return [
        t * x * x + c, t * x * y + s * z, t * x * z - s * y, 0,
        t * x * y - s * z, t * y * y + c, t * y * z + s * x, 0,
        t * x * z + s * y, t * y * z - s * x, t * z * z + c, 0,
        0, 0, 0, 1,
      ];
    },
    transformPoint(m, p) {
      const x = p[0], y = p[1], z = p[2];
      const w = m[3] * x + m[7] * y + m[11] * z + m[15] || 1;
      return [
        (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
        (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
        (m[2] * x + m[6] * y + m[10] * z + m[14]) / w,
      ];
    },
    transformDirection(m, p) {
      const x = p[0], y = p[1], z = p[2];
      return [
        m[0] * x + m[4] * y + m[8] * z,
        m[1] * x + m[5] * y + m[9] * z,
        m[2] * x + m[6] * y + m[10] * z,
      ];
    },
    perspective(fovy, aspect, near, far) {
      const f = 1 / Math.tan(fovy / 2);
      const nf = 1 / (near - far);
      return [
        f / aspect, 0, 0, 0,
        0, f, 0, 0,
        0, 0, (far + near) * nf, -1,
        0, 0, 2 * far * near * nf, 0,
      ];
    },
    ortho(l, r, b, t, n, f) {
      return [
        2 / (r - l), 0, 0, 0,
        0, 2 / (t - b), 0, 0,
        0, 0, -2 / (f - n), 0,
        -(r + l) / (r - l), -(t + b) / (t - b), -(f + n) / (f - n), 1,
      ];
    },
    lookAt(eye, target, up) {
      const f = normalize(sub(target, eye));
      const s = normalize(cross(f, up));
      const u = cross(s, f);
      return [
        s[0], u[0], -f[0], 0,
        s[1], u[1], -f[1], 0,
        s[2], u[2], -f[2], 0,
        -dot(s, eye), -dot(u, eye), dot(f, eye), 1,
      ];
    },
    invert(m) {
      const o = new Array(16);
      const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3];
      const a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
      const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11];
      const a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
      const b00 = a00 * a11 - a01 * a10;
      const b01 = a00 * a12 - a02 * a10;
      const b02 = a00 * a13 - a03 * a10;
      const b03 = a01 * a12 - a02 * a11;
      const b04 = a01 * a13 - a03 * a11;
      const b05 = a02 * a13 - a03 * a12;
      const b06 = a20 * a31 - a21 * a30;
      const b07 = a20 * a32 - a22 * a30;
      const b08 = a20 * a33 - a23 * a30;
      const b09 = a21 * a32 - a22 * a31;
      const b10 = a21 * a33 - a23 * a31;
      const b11 = a22 * a33 - a23 * a32;
      let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
      if (!det) return M4.identity();
      det = 1 / det;
      o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
      o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
      o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
      o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
      o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
      o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
      o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
      o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
      o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
      o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
      o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
      o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
      o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
      o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
      o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
      o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
      return o;
    },
    normal3(m) {
      return [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]];
    },
  };
  G.M4 = M4;

  function basisMatrix(origin, u, v, w) {
    return [
      u[0], u[1], u[2], 0,
      v[0], v[1], v[2], 0,
      w[0], w[1], w[2], 0,
      origin[0], origin[1], origin[2], 1,
    ];
  }
  G.basisMatrix = basisMatrix;

  function perpendicular(axis) {
    const a = normalize(axis);
    const ref = Math.abs(a[1]) > 0.94 ? [1, 0, 0] : [0, 1, 0];
    const u = normalize(cross(a, ref));
    const v = normalize(cross(a, u));
    return [u, v];
  }

  /* ---------------------------------------------------------------------
     2D polygon triangulation (ear clipping)
     --------------------------------------------------------------------- */
  function pointInTri(p, a, b, c) {
    const d1 = (p[0] - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (p[1] - b[1]);
    const d2 = (p[0] - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (p[1] - c[1]);
    const d3 = (p[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (p[1] - a[1]);
    const neg = d1 < 0 || d2 < 0 || d3 < 0;
    const pos = d1 > 0 || d2 > 0 || d3 > 0;
    return !(neg && pos);
  }

  function triangulate2D(poly) {
    const n = poly.length;
    if (n < 3) return [];
    let pts = poly.map((p) => [p[0], p[1]]);
    let area = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1];
    }
    if (area < 0) {
      pts = pts.slice().reverse();
      poly = poly.slice().reverse();
    }
    const idx = pts.map((_, i) => i);
    const out = [];
    let guard = 0;
    while (idx.length > 3 && guard++ < 800) {
      let clipped = false;
      for (let k = 0; k < idx.length; k++) {
        const n2 = idx.length;
        const i0 = idx[(k - 1 + n2) % n2];
        const i1 = idx[k];
        const i2 = idx[(k + 1) % n2];
        const a = pts[i0], b = pts[i1], c = pts[i2];
        const cr = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        if (cr <= 1e-9) continue;
        let bad = false;
        for (const j of idx) {
          if (j === i0 || j === i1 || j === i2) continue;
          if (pointInTri(pts[j], a, b, c)) { bad = true; break; }
        }
        if (bad) continue;
        out.push([poly[i0], poly[i1], poly[i2]]);
        idx.splice(k, 1);
        clipped = true;
        break;
      }
      if (!clipped) break;
    }
    if (idx.length === 3) out.push([poly[idx[0]], poly[idx[1]], poly[idx[2]]]);
    else if (idx.length > 3) {
      for (let i = 1; i < idx.length - 1; i++) {
        out.push([poly[idx[0]], poly[idx[i]], poly[idx[i + 1]]]);
      }
    }
    return out;
  }
  G.triangulate2D = triangulate2D;

  /* ---------------------------------------------------------------------
     Mesh builder — emits flat triangles grouped by material
     --------------------------------------------------------------------- */
  class MeshBuilder {
    constructor() {
      this.groups = new Map();
      this.triCount = 0;
      this._bounds = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    }

    _group(mat) {
      let g = this.groups.get(mat);
      if (!g) {
        g = { pos: [], nor: [], shade: [] };
        this.groups.set(mat, g);
      }
      return g;
    }

    _boundsPoint(p) {
      const b = this._bounds;
      if (p[0] < b[0]) b[0] = p[0];
      if (p[1] < b[1]) b[1] = p[1];
      if (p[2] < b[2]) b[2] = p[2];
      if (p[0] > b[3]) b[3] = p[0];
      if (p[1] > b[4]) b[4] = p[1];
      if (p[2] > b[5]) b[5] = p[2];
    }

    addTri(a, b, c, mat, baseShade = 1) {
      const ab = sub(b, a), ac = sub(c, a);
      let n = cross(ab, ac);
      const l = len(n);
      if (!isFinite(l) || l < 1e-10) return;
      n = mul(n, 1 / l);
      const plane = dot(n, a);
      const h = Math.sin(n[0] * 127.1 + n[1] * 311.7 + n[2] * 74.7 + plane * 21.19) * 43758.5453;
      const frac = h - Math.floor(h);
      const shade = baseShade * (0.962 + frac * 0.072);
      const g = this._group(mat);
      g.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
      g.nor.push(n[0], n[1], n[2], n[0], n[1], n[2], n[0], n[1], n[2]);
      g.shade.push(shade, shade, shade);
      this.triCount++;
      this._boundsPoint(a); this._boundsPoint(b); this._boundsPoint(c);
    }

    addQuad(a, b, c, d, mat, baseShade = 1) {
      this.addTri(a, b, c, mat, baseShade);
      this.addTri(a, c, d, mat, baseShade);
    }

    addPolygon3D(points, mat, baseShade = 1) {
      if (points.length < 3) return;
      // project onto the dominant plane
      const n = normalize(cross(sub(points[1], points[0]), sub(points[2], points[0])));
      const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
      let proj;
      if (ax >= ay && ax >= az) proj = points.map((p) => [p[1], p[2]]);
      else if (ay >= ax && ay >= az) proj = points.map((p) => [p[0], p[2]]);
      else proj = points.map((p) => [p[0], p[1]]);
      const tris = triangulate2D(proj);
      const map = new Map();
      proj.forEach((p, i) => {
        const key = p[0].toFixed(7) + ',' + p[1].toFixed(7);
        if (!map.has(key)) map.set(key, i);
      });
      tris.forEach((tri) => {
        const pts = tri.map((p) => {
          const key = p[0].toFixed(7) + ',' + p[1].toFixed(7);
          return points[map.get(key)];
        });
        this.addTri(pts[0], pts[1], pts[2], mat, baseShade);
      });
    }

    addPrism2D(points, z0, z1, transform, mat, shade = 1) {
      const tris = triangulate2D(points);
      const tf = (p, z) => M4.transformPoint(transform, [p[0], p[1], z]);
      const n = points.length;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        this.addQuad(tf(points[i], z0), tf(points[j], z0), tf(points[j], z1), tf(points[i], z1), mat, shade);
      }
      tris.forEach((tri) => {
        this.addTri(tf(tri[0], z1), tf(tri[1], z1), tf(tri[2], z1), mat, shade);
        this.addTri(tf(tri[2], z0), tf(tri[1], z0), tf(tri[0], z0), mat, shade);
      });
    }

    addSurfaceGrid(grid, mat, shade = 1) {
      const cols = grid.length;
      for (let i = 0; i < cols - 1; i++) {
        const rows = Math.min(grid[i].length, grid[i + 1].length);
        for (let j = 0; j < rows - 1; j++) {
          this.addQuad(grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j], mat, shade);
        }
      }
    }

    addClosedGrid(grid, offset, mat, shade = 1) {
      const cols = grid.length;
      if (!cols) return;
      const rows = grid[0].length;
      const off = offset;
      const inner = grid.map((col) => col.map((p) => add(p, off)));
      // outer
      for (let i = 0; i < cols - 1; i++) {
        for (let j = 0; j < rows - 1; j++) {
          this.addQuad(grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j], mat, shade);
        }
      }
      // inner
      for (let i = 0; i < cols - 1; i++) {
        for (let j = 0; j < rows - 1; j++) {
          this.addQuad(inner[i][j], inner[i + 1][j], inner[i + 1][j + 1], inner[i][j + 1], mat, shade);
        }
      }
      // boundary walls
      for (let i = 0; i < cols - 1; i++) {
        this.addQuad(grid[i][0], inner[i][0], inner[i + 1][0], grid[i + 1][0], mat, shade);
        this.addQuad(grid[i][rows - 1], grid[i + 1][rows - 1], inner[i + 1][rows - 1], inner[i][rows - 1], mat, shade);
      }
      for (let j = 0; j < rows - 1; j++) {
        this.addQuad(grid[0][j], grid[0][j + 1], inner[0][j + 1], inner[0][j], mat, shade);
        this.addQuad(grid[cols - 1][j], inner[cols - 1][j], inner[cols - 1][j + 1], grid[cols - 1][j + 1], mat, shade);
      }
    }

    addBox(cx, cy, cz, sx, sy, sz, mat, transform, shade = 1) {
      const hx = sx / 2, hy = sy / 2, hz = sz / 2;
      const pts = [
        [-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz],
        [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz],
      ].map((p) => {
        const q = [p[0] + cx, p[1] + cy, p[2] + cz];
        return transform ? M4.transformPoint(transform, q) : q;
      });
      const f = [
        [0, 1, 2, 3], [7, 6, 5, 4], [4, 5, 1, 0],
        [3, 2, 6, 7], [0, 3, 7, 4], [1, 5, 6, 2],
      ];
      f.forEach((q) => this.addQuad(pts[q[0]], pts[q[1]], pts[q[2]], pts[q[3]], mat, shade));
    }

    addOrientedBox(center, u, v, w, hx, hy, hz, mat, shade = 1) {
      const p = [];
      for (const su of [-1, 1]) for (const sv of [-1, 1]) for (const sw of [-1, 1]) {
        p.push(add(center, add(add(mul(u, su * hx), mul(v, sv * hy)), mul(w, sw * hz))));
      }
      // index: su=0/1, sv=0/1, sw=0/1 -> bits
      const idx = (a, b, c) => (a * 4 + b * 2 + c);
      const f = [
        [idx(0,0,0), idx(0,1,0), idx(1,1,0), idx(1,0,0)],
        [idx(0,0,1), idx(1,0,1), idx(1,1,1), idx(0,1,1)],
        [idx(0,0,0), idx(1,0,0), idx(1,0,1), idx(0,0,1)],
        [idx(0,1,0), idx(0,1,1), idx(1,1,1), idx(1,1,0)],
        [idx(0,0,0), idx(0,0,1), idx(0,1,1), idx(0,1,0)],
        [idx(1,0,0), idx(1,1,0), idx(1,1,1), idx(1,0,1)],
      ];
      f.forEach((q) => this.addQuad(p[q[0]], p[q[1]], p[q[2]], p[q[3]], mat, shade));
    }

    addBeam(a, b, width, height, mat, upHint = [0, 1, 0], shade = 1) {
      const axis = normalize(sub(b, a));
      let side = cross(axis, upHint);
      if (len(side) < 1e-5) side = cross(axis, [1, 0, 0]);
      side = normalize(side);
      const up = normalize(cross(side, axis));
      const center = mix3(a, b, 0.5);
      const l = len(sub(b, a));
      this.addOrientedBox(center, side, up, axis, width / 2, height / 2, l / 2, mat, shade);
    }

    addRevolveAxis(center, axis, profile, segments, mat, closedProfile = true, shade = 1) {
      const [u, v] = perpendicular(axis);
      const a = normalize(axis);
      const rings = [];
      for (let j = 0; j <= segments; j++) {
        const th = (j / segments) * Math.PI * 2;
        const cs = Math.cos(th), sn = Math.sin(th);
        const ring = profile.map((pr) => {
          const radial = add(mul(u, cs), mul(v, sn));
          return add(add(center, mul(radial, pr[1])), mul(a, pr[0]));
        });
        rings.push(ring);
      }
      const m = profile.length;
      const maxJ = closedProfile ? m : m - 1;
      for (let j = 0; j < segments; j++) {
        for (let k = 0; k < maxJ; k++) {
          const k2 = (k + 1) % m;
          this.addQuad(rings[j][k], rings[j][k2], rings[j + 1][k2], rings[j + 1][k], mat, shade);
        }
      }
    }

    addCylinder(a, b, r1, r2, segments, mat, caps = true, shade = 1) {
      const axis = normalize(sub(b, a));
      const [u, v] = perpendicular(axis);
      const rings = [];
      for (let j = 0; j <= segments; j++) {
        const th = (j / segments) * Math.PI * 2;
        const cs = Math.cos(th), sn = Math.sin(th);
        rings.push([
          add(add(a, mul(add(mul(u, cs), mul(v, sn)), r1)), [0, 0, 0]),
          add(add(b, mul(add(mul(u, cs), mul(v, sn)), r2)), [0, 0, 0]),
        ]);
      }
      for (let j = 0; j < segments; j++) {
        this.addQuad(rings[j][0], rings[j + 1][0], rings[j + 1][1], rings[j][1], mat, shade);
      }
      if (caps) {
        for (let j = 0; j < segments; j++) {
          this.addTri(a, rings[j + 1][0], rings[j][0], mat, shade);
          this.addTri(b, rings[j][1], rings[j + 1][1], mat, shade);
        }
      }
    }

    addTube(a, b, rOuter, rInner, segments, mat, shade = 1) {
      const axis = normalize(sub(b, a));
      const l = len(sub(b, a));
      const center = mix3(a, b, 0.5);
      const profile = [
        [-l / 2, rInner], [-l / 2, rOuter], [l / 2, rOuter], [l / 2, rInner],
      ];
      this.addRevolveAxis(center, axis, profile, segments, mat, true, shade);
    }

    addTorus(center, axis, R, r, majorSeg, minorSeg, mat, shade = 1) {
      const [u, v] = perpendicular(axis);
      const a = normalize(axis);
      const rings = [];
      for (let i = 0; i <= majorSeg; i++) {
        const th = (i / majorSeg) * Math.PI * 2;
        const cs = Math.cos(th), sn = Math.sin(th);
        const radial = add(mul(u, cs), mul(v, sn));
        const ring = [];
        for (let j = 0; j <= minorSeg; j++) {
          const ph = (j / minorSeg) * Math.PI * 2;
          ring.push(add(add(center, mul(radial, R + r * Math.cos(ph))), mul(a, r * Math.sin(ph))));
        }
        rings.push(ring);
      }
      for (let i = 0; i < majorSeg; i++) {
        for (let j = 0; j < minorSeg; j++) {
          this.addQuad(rings[i][j], rings[i + 1][j], rings[i + 1][j + 1], rings[i][j + 1], mat, shade);
        }
      }
    }

    addPolylineTube(points, radius, segments, mat, closed = false, shade = 1) {
      if (points.length < 2) return;
      const n = points.length;
      const rings = [];
      for (let i = 0; i < n; i++) {
        const prev = points[(i - 1 + n) % n];
        const next = points[(i + 1) % n];
        let tangent;
        if (!closed && i === 0) tangent = normalize(sub(points[1], points[0]));
        else if (!closed && i === n - 1) tangent = normalize(sub(points[n - 1], points[n - 2]));
        else tangent = normalize(sub(next, prev));
        const [u, v] = perpendicular(tangent);
        const ring = [];
        for (let j = 0; j <= segments; j++) {
          const th = (j / segments) * Math.PI * 2;
          ring.push(add(points[i], mul(add(mul(u, Math.cos(th)), mul(v, Math.sin(th))), radius)));
        }
        rings.push(ring);
      }
      const segs = closed ? n : n - 1;
      for (let i = 0; i < segs; i++) {
        const j = (i + 1) % n;
        for (let k = 0; k < segments; k++) {
          this.addQuad(rings[i][k], rings[i][k + 1], rings[j][k + 1], rings[j][k], mat, shade);
        }
      }
      if (!closed) {
        for (let k = 0; k < segments; k++) {
          this.addTri(points[0], rings[0][k + 1], rings[0][k], mat, shade);
          this.addTri(points[n - 1], rings[n - 1][k], rings[n - 1][k + 1], mat, shade);
        }
      }
    }

    addHelix(center, axis, R, height, turns, tubeR, segmentsPerTurn, mat, shade = 1) {
      const [u, v] = perpendicular(axis);
      const a = normalize(axis);
      const total = Math.max(8, Math.floor(turns * segmentsPerTurn));
      const pts = [];
      for (let i = 0; i <= total; i++) {
        const t = i / total;
        const th = t * turns * Math.PI * 2;
        pts.push(add(add(center, mul(a, (t - 0.5) * height)), mul(add(mul(u, Math.cos(th)), mul(v, Math.sin(th))), R)));
      }
      this.addPolylineTube(pts, tubeR, 5, mat, false, shade);
    }

    finish() {
      const meshes = [];
      for (const [mat, g] of this.groups) {
        meshes.push({
          mat,
          positions: new Float32Array(g.pos),
          normals: new Float32Array(g.nor),
          shades: new Float32Array(g.shade),
          triangles: g.pos.length / 9,
        });
      }
      const b = this._bounds;
      return {
        meshes,
        triCount: this.triCount,
        bounds: isFinite(b[0]) ? { min: [b[0], b[1], b[2]], max: [b[3], b[4], b[5]] } : { min: [0,0,0], max: [0,0,0] },
      };
    }
  }
  G.MeshBuilder = MeshBuilder;

  // ray helpers
  G.rayFromNDC = function (x, y, invViewProj) {
    const near = M4.transformPoint(invViewProj, [x, y, -1]);
    const far = M4.transformPoint(invViewProj, [x, y, 1]);
    return { origin: near, dir: normalize(sub(far, near)) };
  };

  G.rayAABB = function (origin, dir, bmin, bmax) {
    let tmin = -Infinity, tmax = Infinity;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(dir[i]) < 1e-9) {
        if (origin[i] < bmin[i] || origin[i] > bmax[i]) return false;
      } else {
        let t1 = (bmin[i] - origin[i]) / dir[i];
        let t2 = (bmax[i] - origin[i]) / dir[i];
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
        tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
        if (tmin > tmax) return false;
      }
    }
    return tmax >= Math.max(0, tmin);
  };

  G.rayTriangle = function (origin, dir, a, b, c) {
    const e1 = sub(b, a), e2 = sub(c, a);
    const p = cross(dir, e2);
    const det = dot(e1, p);
    if (Math.abs(det) < 1e-9) return -1;
    const inv = 1 / det;
    const tvec = sub(origin, a);
    const u = dot(tvec, p) * inv;
    if (u < 0 || u > 1) return -1;
    const q = cross(tvec, e1);
    const v = dot(dir, q) * inv;
    if (v < 0 || u + v > 1) return -1;
    const t = dot(e2, q) * inv;
    return t > 1e-5 ? t : -1;
  };

  G.computeNormals = function (positions, indices) {
    const nor = new Float32Array(positions.length);
    for (let i = 0; i < indices.length; i += 3) {
      const ia = indices[i] * 3, ib = indices[i + 1] * 3, ic = indices[i + 2] * 3;
      const a = [positions[ia], positions[ia + 1], positions[ia + 2]];
      const b = [positions[ib], positions[ib + 1], positions[ib + 2]];
      const c = [positions[ic], positions[ic + 1], positions[ic + 2]];
      const n = normalize(cross(sub(b, a), sub(c, a)));
      [ia, ib, ic].forEach((ix) => { nor[ix] += n[0]; nor[ix + 1] += n[1]; nor[ix + 2] += n[2]; });
    }
    for (let i = 0; i < nor.length; i += 3) {
      const n = normalize([nor[i], nor[i + 1], nor[i + 2]]);
      nor[i] = n[0]; nor[i + 1] = n[1]; nor[i + 2] = n[2];
    }
    return nor;
  };
})();
