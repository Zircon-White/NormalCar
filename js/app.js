/* FORM / 01 — minimal WebGL viewer */
(function () {
  'use strict';

  const { M4, normalize, sub, rayAABB, rayTriangle } = window.G;
  const CAR = window.CAR;
  const canvas = document.getElementById('gl');

  const gl = canvas.getContext('webgl', {
    antialias: true,
    alpha: true,
    depth: true,
    powerPreference: 'high-performance',
  });
  if (!gl) {
    document.getElementById('fallback').hidden = false;
    return;
  }

  /* -----------------------------------------------------------------------
     shaders
     ----------------------------------------------------------------------- */
  const lightShader = `
    attribute vec3 aPos;
    attribute vec3 aNor;
    attribute float aShade;
    uniform mat4 uVP;
    uniform mat4 uModel;
    uniform mat3 uNormal;
    varying vec3 vWorld;
    varying vec3 vNor;
    varying float vShade;
    void main() {
      vec4 wp = uModel * vec4(aPos, 1.0);
      vWorld = wp.xyz;
      vNor = uNormal * aNor;
      vShade = aShade;
      gl_Position = uVP * wp;
    }
  `;
  const lightFrag = `
    precision highp float;
    uniform vec3 uColor;
    uniform vec3 uCam;
    uniform float uAlpha;
    uniform float uSpec;
    uniform float uShine;
    uniform float uMetal;
    uniform float uSelect;
    varying vec3 vWorld;
    varying vec3 vNor;
    varying float vShade;

    const vec3 L1 = vec3(-0.52, 0.90, 0.46);
    const vec3 L2 = vec3( 0.78, 0.28, -0.36);
    const vec3 L3 = vec3( 0.20, 0.40, -0.92);
    const vec3 ACCENT = vec3(0.56, 0.90, 0.71);

    void main() {
      vec3 N = normalize(vNor);
      if (!gl_FrontFacing) N = -N;
      vec3 V = normalize(uCam - vWorld);
      vec3 nL1 = normalize(L1);
      vec3 nL2 = normalize(L2);
      vec3 nL3 = normalize(L3);
      float key = max(dot(N, nL1), 0.0);
      float fill = max(dot(N, nL2), 0.0);
      float rim = max(dot(N, nL3), 0.0);
      float hemi = 0.5 + 0.5 * N.y;
      vec3 ambient = mix(vec3(0.160, 0.168, 0.174), vec3(0.445, 0.455, 0.462), hemi);
      vec3 base = uColor * vShade;
      vec3 col = base * (ambient + key * 0.64 + fill * 0.24);
      float sideFill = max(dot(N, normalize(vec3(-0.90, 0.22, 0.28))), 0.0) * 0.10
                     + max(dot(N, normalize(vec3( 0.90, 0.22, 0.28))), 0.0) * 0.07;
      col += base * (sideFill + (1.0 - abs(N.y)) * 0.17 + rim * 0.10);
      vec3 H = normalize(nL1 + V);
      float spec = pow(max(dot(N, H), 0.0), uShine) * uSpec;
      col += vec3(0.93, 0.95, 0.97) * spec;
      float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
      col += vec3(0.33, 0.37, 0.39) * fres * (0.10 + uMetal * 0.22);
      col = mix(col, col * 0.58 + ACCENT * 0.22, uSelect);
      col = pow(max(col, 0.0), vec3(0.84));
      gl_FragColor = vec4(col, uAlpha);
    }
  `;

  const floorVert = `
    attribute vec3 aPos;
    uniform mat4 uVP;
    varying vec3 vPos;
    void main() {
      vPos = aPos;
      gl_Position = uVP * vec4(aPos, 1.0);
    }
  `;
  const floorFrag = `
    precision highp float;
    varying vec3 vPos;
    float grid(vec2 p, float scale, float width) {
      vec2 q = abs(fract(p / scale - 0.5) - 0.5) * scale;
      float d = min(q.x, q.y);
      return 1.0 - smoothstep(0.0, width, d);
    }
    void main() {
      float radial = 1.0 - smoothstep(2.0, 9.5, length(vPos.xz - vec2(0.0, -0.1)));
      float g1 = grid(vPos.xz, 0.5, 0.012);
      float g2 = grid(vPos.xz, 2.0, 0.020);
      vec3 col = mix(vec3(0.032, 0.035, 0.038), vec3(0.088, 0.096, 0.101), radial);
      col += vec3(0.17, 0.19, 0.20) * (g1 * 0.24 + g2 * 0.46) * radial;
      float alpha = radial * 0.88;
      gl_FragColor = vec4(col, alpha);
    }
  `;
  const shadowVert = `
    attribute vec3 aPos;
    uniform mat4 uVP;
    varying vec3 vPos;
    void main() {
      vPos = aPos;
      gl_Position = uVP * vec4(aPos, 1.0);
    }
  `;
  const shadowFrag = `
    precision highp float;
    varying vec3 vPos;
    float blob(vec2 p, vec2 c, vec2 r) {
      vec2 d = (p - c) / r;
      return exp(-dot(d, d) * 2.0);
    }
    void main() {
      vec2 p = vPos.xz;
      float body = blob(p, vec2(0.0, -0.06), vec2(1.20, 2.25));
      float wfl = blob(p, vec2(-0.84, 1.35), vec2(0.30, 0.46));
      float wfr = blob(p, vec2(0.84, 1.35), vec2(0.30, 0.46));
      float wrl = blob(p, vec2(-0.84, -1.35), vec2(0.32, 0.48));
      float wrr = blob(p, vec2(0.84, -1.35), vec2(0.32, 0.48));
      float a = 0.34 * body + 0.34 * (wfl + wfr + wrl + wrr);
      a *= 1.0 - smoothstep(6.0, 10.0, length(p));
      gl_FragColor = vec4(0.008, 0.010, 0.011, a);
    }
  `;

  function makeProgram(vs, fs) {
    const compile = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(sh));
      }
      return sh;
    };
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }

  const lightProg = makeProgram(lightShader, lightFrag);
  const lightLoc = {
    aPos: gl.getAttribLocation(lightProg, 'aPos'),
    aNor: gl.getAttribLocation(lightProg, 'aNor'),
    aShade: gl.getAttribLocation(lightProg, 'aShade'),
    uVP: gl.getUniformLocation(lightProg, 'uVP'),
    uModel: gl.getUniformLocation(lightProg, 'uModel'),
    uNormal: gl.getUniformLocation(lightProg, 'uNormal'),
    uColor: gl.getUniformLocation(lightProg, 'uColor'),
    uCam: gl.getUniformLocation(lightProg, 'uCam'),
    uAlpha: gl.getUniformLocation(lightProg, 'uAlpha'),
    uSpec: gl.getUniformLocation(lightProg, 'uSpec'),
    uShine: gl.getUniformLocation(lightProg, 'uShine'),
    uMetal: gl.getUniformLocation(lightProg, 'uMetal'),
    uSelect: gl.getUniformLocation(lightProg, 'uSelect'),
  };

  const floorProg = makeProgram(floorVert, floorFrag);
  const floorLoc = {
    aPos: gl.getAttribLocation(floorProg, 'aPos'),
    uVP: gl.getUniformLocation(floorProg, 'uVP'),
  };
  const shadowProg = makeProgram(shadowVert, shadowFrag);
  const shadowLoc = {
    aPos: gl.getAttribLocation(shadowProg, 'aPos'),
    uVP: gl.getUniformLocation(shadowProg, 'uVP'),
  };

  /* -----------------------------------------------------------------------
     geometry upload
     ----------------------------------------------------------------------- */
  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  CAR.materials = Object.fromEntries(Object.entries(CAR.materials).map(([k, v]) => {
    const alpha = v.alpha == null ? 1 : v.alpha;
    return [k, { ...v, rgb: hexToRgb(v.color), alpha }];
  }));

  const drawMeshes = [];
  CAR.parts.forEach((part) => {
    part._offset = [0, 0, 0];
    part._visible = true;
    part.meshes.forEach((mesh) => {
      const count = mesh.positions.length / 3;
      const data = new Float32Array(count * 7);
      for (let i = 0; i < count; i++) {
        data[i * 7] = mesh.positions[i * 3];
        data[i * 7 + 1] = mesh.positions[i * 3 + 1];
        data[i * 7 + 2] = mesh.positions[i * 3 + 2];
        data[i * 7 + 3] = mesh.normals[i * 3];
        data[i * 7 + 4] = mesh.normals[i * 3 + 1];
        data[i * 7 + 5] = mesh.normals[i * 3 + 2];
        data[i * 7 + 6] = mesh.shades[i];
      }
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      drawMeshes.push({
        part, mesh, buffer, count,
        mat: CAR.materials[mesh.mat] || CAR.materials.clay,
        transparent: (CAR.materials[mesh.mat] || {}).alpha < 1,
      });
    });
  });

  const floorBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, floorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -18, 0, -18, 18, 0, -18, 18, 0, 18,
    -18, 0, -18, 18, 0, 18, -18, 0, 18,
  ]), gl.STATIC_DRAW);

  const shadowBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, shadowBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -6, 0.002, -6, 6, 0.002, -6, 6, 0.002, 6,
    -6, 0.002, -6, 6, 0.002, 6, -6, 0.002, 6,
  ]), gl.STATIC_DRAW);

  /* -----------------------------------------------------------------------
     camera
     ----------------------------------------------------------------------- */
  const cam = {
    yaw: -0.68,
    pitch: 0.235,
    radius: 6.9,
    target: [0, 0.56, 0],
    desiredYaw: -0.68,
    desiredPitch: 0.235,
    desiredRadius: 6.9,
    desiredTarget: [0, 0.56, 0],
  };

  let explode = 0;
  let explodeTarget = 0;
  let autoRotate = false;
  let selected = null;
  let isolated = false;
  let lastTime = performance.now();
  let viewProj = M4.identity();
  let invViewProj = M4.identity();
  let eye = [0, 0, 0];

  const statsEl = document.getElementById('stats');
  statsEl.innerHTML = `<span>${CAR.stats.parts}</span> PARTS &nbsp;·&nbsp; <span>${(CAR.stats.triangles / 1000).toFixed(1)}k</span> TRIS &nbsp;·&nbsp; 1:1`;

  function currentOffset(part) {
    const e = explode;
    const delay = part.delay || 0;
    const lt = Math.max(0, Math.min(1, (e - delay) / (1 - delay)));
    const k = lt * lt * (3 - 2 * lt);
    return [part.explode[0] * k, part.explode[1] * k, part.explode[2] * k];
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function updateCamera(dt) {
    const damp = 1 - Math.pow(0.0008, dt);
    cam.yaw += (cam.desiredYaw - cam.yaw) * damp;
    cam.pitch += (cam.desiredPitch - cam.pitch) * damp;
    cam.radius += (cam.desiredRadius - cam.radius) * damp;
    for (let i = 0; i < 3; i++) cam.target[i] += (cam.desiredTarget[i] - cam.target[i]) * damp;
    if (autoRotate && !dragging) cam.desiredYaw += dt * 0.18;
    const cp = Math.cos(cam.pitch);
    eye = [
      cam.target[0] + cam.radius * cp * Math.sin(cam.yaw),
      cam.target[1] + cam.radius * Math.sin(cam.pitch),
      cam.target[2] + cam.radius * cp * Math.cos(cam.yaw),
    ];
    const proj = M4.perspective((30 * Math.PI) / 180, canvas.width / canvas.height, 0.1, 60);
    const view = M4.lookAt(eye, cam.target, [0, 1, 0]);
    viewProj = M4.multiply(proj, view);
    invViewProj = M4.invert(viewProj);
  }

  /* -----------------------------------------------------------------------
     drawing
     ----------------------------------------------------------------------- */
  function bindMesh(draw) {
    gl.bindBuffer(gl.ARRAY_BUFFER, draw.buffer);
    const stride = 7 * 4;
    gl.enableVertexAttribArray(lightLoc.aPos);
    gl.vertexAttribPointer(lightLoc.aPos, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(lightLoc.aNor);
    gl.vertexAttribPointer(lightLoc.aNor, 3, gl.FLOAT, false, stride, 3 * 4);
    gl.enableVertexAttribArray(lightLoc.aShade);
    gl.vertexAttribPointer(lightLoc.aShade, 1, gl.FLOAT, false, stride, 6 * 4);
  }

  function drawGradientFloor() {
    gl.useProgram(floorProg);
    gl.uniformMatrix4fv(floorLoc.uVP, false, viewProj);
    gl.bindBuffer(gl.ARRAY_BUFFER, floorBuffer);
    gl.enableVertexAttribArray(floorLoc.aPos);
    gl.vertexAttribPointer(floorLoc.aPos, 3, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.disable(gl.DEPTH_TEST);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.useProgram(shadowProg);
    gl.uniformMatrix4fv(shadowLoc.uVP, false, viewProj);
    gl.bindBuffer(gl.ARRAY_BUFFER, shadowBuffer);
    gl.enableVertexAttribArray(shadowLoc.aPos);
    gl.vertexAttribPointer(shadowLoc.aPos, 3, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  function drawCar() {
    gl.useProgram(lightProg);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.uniformMatrix4fv(lightLoc.uVP, false, viewProj);
    gl.uniform3fv(lightLoc.uCam, eye);
    gl.uniformMatrix3fv(lightLoc.uNormal, false, [1, 0, 0, 0, 1, 0, 0, 0, 1]);

    const visible = drawMeshes.filter((d) =>
      d.part._visible && (!isolated || d.part === selected)
    );
    const opaque = visible.filter((d) => !d.transparent);
    const transparent = visible.filter((d) => d.transparent);

    for (const d of opaque) {
      if (!d.part._offset) continue;
      const mat = d.mat;
      gl.uniform3fv(lightLoc.uColor, mat.rgb);
      gl.uniform1f(lightLoc.uAlpha, 1);
      gl.uniform1f(lightLoc.uSpec, mat.spec);
      gl.uniform1f(lightLoc.uShine, mat.shine);
      gl.uniform1f(lightLoc.uMetal, mat.metal);
      gl.uniform1f(lightLoc.uSelect, d.part === selected ? 1 : 0);
      const m = M4.translation(d.part._offset[0], d.part._offset[1], d.part._offset[2]);
      gl.uniformMatrix4fv(lightLoc.uModel, false, m);
      bindMesh(d);
      gl.drawArrays(gl.TRIANGLES, 0, d.count);
    }

    // transparent glass, far to near
    const eyeDist = (d) => {
      const dx = d.part.center[0] + d.part._offset[0] - eye[0];
      const dy = d.part.center[1] + d.part._offset[1] - eye[1];
      const dz = d.part.center[2] + d.part._offset[2] - eye[2];
      return dx * dx + dy * dy + dz * dz;
    };
    transparent.sort((a, b) => eyeDist(b) - eyeDist(a));
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    for (const d of transparent) {
      const mat = d.mat;
      gl.uniform3fv(lightLoc.uColor, mat.rgb);
      gl.uniform1f(lightLoc.uAlpha, mat.alpha);
      gl.uniform1f(lightLoc.uSpec, mat.spec);
      gl.uniform1f(lightLoc.uShine, mat.shine);
      gl.uniform1f(lightLoc.uMetal, mat.metal);
      gl.uniform1f(lightLoc.uSelect, d.part === selected ? 1 : 0);
      const m = M4.translation(d.part._offset[0], d.part._offset[1], d.part._offset[2]);
      gl.uniformMatrix4fv(lightLoc.uModel, false, m);
      bindMesh(d);
      gl.drawArrays(gl.TRIANGLES, 0, d.count);
    }
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  function animate(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    resize();
    explode += (explodeTarget - explode) * (1 - Math.pow(0.001, dt));
    for (const p of CAR.parts) {
      p._offset = currentOffset(p);
      p._visible = true;
    }
    updateCamera(dt);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.CULL_FACE);
    drawGradientFloor();
    drawCar();
    requestAnimationFrame(animate);
  }

  /* -----------------------------------------------------------------------
     picking
     ----------------------------------------------------------------------- */
  let down = null;
  let dragging = false;

  function pick(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((clientY - rect.top) / rect.height) * 2 - 1);
    const near = M4.transformPoint(invViewProj, [x, y, -1]);
    const far = M4.transformPoint(invViewProj, [x, y, 1]);
    const origin = near;
    const dir = normalize(sub(far, near));
    let best = null;
    let bestT = Infinity;
    for (const part of CAR.parts) {
      if (!part.visible || !part.pick) continue;
      if (isolated && part !== selected) continue;
      const o = sub(origin, part._offset);
      const bmin = part.bounds.min;
      const bmax = part.bounds.max;
      if (!rayAABB(o, dir, bmin, bmax)) continue;
      for (const mesh of part.meshes) {
        const p = mesh.positions;
        for (let i = 0; i < p.length; i += 9) {
          const t = rayTriangle(o, dir, [p[i], p[i + 1], p[i + 2]], [p[i + 3], p[i + 4], p[i + 5]], [p[i + 6], p[i + 7], p[i + 8]]);
          if (t > 0 && t < bestT) { bestT = t; best = part; }
        }
      }
    }
    return best;
  }

  const inspector = document.getElementById('inspector');
  const selName = document.getElementById('selName');
  const selEn = document.getElementById('selEn');
  const selCode = document.getElementById('selCode');
  const selDims = document.getElementById('selDims');
  const selTris = document.getElementById('selTris');
  const isolateBtn = document.getElementById('isolateBtn');
  const clearBtn = document.getElementById('clearSel');

  function selectPart(part) {
    selected = part;
    if (!part) {
      inspector.classList.remove('show');
      return;
    }
    selName.textContent = part.name;
    selEn.textContent = part.en;
    selCode.textContent = part.code;
    selDims.textContent = `${Math.round(part.dims[0])} × ${Math.round(part.dims[1])} × ${Math.round(part.dims[2])} mm`;
    selTris.textContent = `${part.triCount.toLocaleString()} tris · ${part.materialLabel.split('/')[0].trim()}`;
    inspector.classList.add('show');
    isolateBtn.textContent = isolated ? '退出单独显示' : '单独显示';
  }

  function clearSelection() {
    if (isolated) return;
    selectPart(null);
  }

  isolateBtn.addEventListener('click', () => {
    if (!selected) return;
    isolated = !isolated;
    isolateBtn.textContent = isolated ? '退出单独显示' : '单独显示';
  });
  clearBtn.addEventListener('click', () => {
    isolated = false;
    selectPart(null);
  });

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    down = { x: e.clientX, y: e.clientY, yaw: cam.desiredYaw, pitch: cam.desiredPitch, t: performance.now() };
    dragging = true;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!down) return;
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) {
      cam.desiredYaw = down.yaw - dx * 0.006;
      cam.desiredPitch = Math.max(-0.02, Math.min(1.22, down.pitch + dy * 0.0045));
    }
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!down) return;
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    const wasClick = Math.hypot(dx, dy) < 4 && performance.now() - down.t < 500;
    down = null;
    dragging = false;
    if (wasClick) {
      const part = pick(e.clientX, e.clientY);
      if (part) {
        isolated = false;
        selectPart(part);
      } else if (!isolated) {
        selectPart(null);
      }
    }
  });
  canvas.addEventListener('pointercancel', () => { down = null; dragging = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    cam.desiredRadius = Math.max(3.8, Math.min(12, cam.desiredRadius * Math.exp(e.deltaY * 0.001)));
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      isolated = false;
      selectPart(null);
    }
    if (e.key === 'r' || e.key === 'R') resetView();
    if (e.key === ' ') {
      e.preventDefault();
      toggleAuto();
    }
  });

  const autoBtn = document.getElementById('autoBtn');
  function toggleAuto() {
    autoRotate = !autoRotate;
    autoBtn.classList.toggle('on', autoRotate);
    autoBtn.textContent = autoRotate ? '停止旋转' : '自动旋转';
  }
  autoBtn.addEventListener('click', toggleAuto);

  function resetView() {
    cam.desiredYaw = -0.68;
    cam.desiredPitch = 0.235;
    cam.desiredRadius = 6.9;
    cam.desiredTarget = [0, 0.56, 0];
  }
  document.getElementById('resetBtn').addEventListener('click', () => {
    resetView();
    isolated = false;
    selectPart(null);
  });

  const slider = document.getElementById('explode');
  const value = document.getElementById('explodeVal');
  slider.addEventListener('input', () => {
    explodeTarget = Number(slider.value) / 100;
    value.textContent = slider.value + '%';
  });
  document.getElementById('explodeBtn').addEventListener('click', () => {
    const next = explodeTarget > 0.5 ? 0 : 1;
    explodeTarget = next;
    slider.value = String(next * 100);
    value.textContent = Math.round(next * 100) + '%';
  });
  document.getElementById('focusBtn').addEventListener('click', () => {
    if (!selected) return;
    cam.desiredTarget = [
      selected.center[0] + selected._offset[0],
      selected.center[1] + selected._offset[1],
      selected.center[2] + selected._offset[2],
    ];
    cam.desiredRadius = Math.max(2.2, Math.min(4.8, (Math.max(...selected.dims) / 1000) * 2.0));
  });

  // reveal the viewport once the first frame is ready
  const loading = document.getElementById('loading');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (loading) loading.classList.add('done');
    });
  });

  resize();
  requestAnimationFrame((t) => { lastTime = t; animate(t); });
})();
