/*
 * Pró Saúde Academia — "Pulso" — fundo interativo do hero (v3, 3D)
 * ---------------------------------------------------------------------
 * WebGL puro (sem Three.js, sem dependências): uma grade de linhas de
 * "batimento" (a mesma forma de onda usada nos SVGs de pulso do resto
 * do site — uma linha suave com um pico agudo por ciclo) se estende
 * para dentro da tela, em profundidade real, com uma câmera em
 * perspectiva calculada na mão. É o mesmo motivo de "vital sign" que
 * aparece no traço do hero/CTA final/prova social, só que agora
 * atravessado por uma câmera 3D — a ideia é unificar num motivo só
 * (pulso/constância) em vez de ter um efeito de fundo que não conversa
 * com o resto da identidade visual.
 *
 * Mouse: desloca a câmera lateralmente e escolhe qual "linha" ganha
 * mais brilho (a mais próxima da altura do cursor). Scroll: avança a
 * câmera por entre as linhas, como se estivesse atravessando treze
 * anos de batimentos. Clique/toque: solta um pulso extra que percorre
 * a grade e desaparece — e, para quem nunca clicaria por conta
 * própria, um pulso de "demonstração" dispara sozinho ~1.6s depois do
 * carregamento, só uma vez, pra ensinar que aquilo é interativo.
 *
 * Robustez: fallback automático para Canvas2D (linhas de fluxo com a
 * mesma forma de onda) se WebGL não existir ou os shaders não
 * compilarem/linkarem. Motion reduzido ou nenhum canvas disponível:
 * fica só o gradiente estático do CSS — nunca uma tela quebrada.
 */
(function () {
  "use strict";

  var canvas = document.querySelector(".hero__gl");
  if (!canvas) return;

  var prefersReduced = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;
  if (prefersReduced) return;

  var ROWS = 14;

  // -----------------------------------------------------------------
  // Estado compartilhado entre WebGL e o fallback Canvas2D.
  // -----------------------------------------------------------------
  var mouse = { x: 0.5, y: 0.5, targetX: 0.5, targetY: 0.5 };
  var scrollT = 0;
  var running = true;
  var visible = true;
  var ripple = { x: 0.5, y: 0.5, t: 999 };

  function updateScrollProgress() {
    var rect = canvas.parentElement.getBoundingClientRect();
    var progress = -rect.top / Math.max(1, rect.height);
    scrollT = Math.min(1, Math.max(0, progress));
  }
  window.addEventListener("scroll", updateScrollProgress, { passive: true });
  updateScrollProgress();

  canvas.style.pointerEvents = "auto";
  canvas.addEventListener("pointermove", function (e) {
    var rect = canvas.getBoundingClientRect();
    mouse.targetX = (e.clientX - rect.left) / rect.width;
    mouse.targetY = (e.clientY - rect.top) / rect.height;
  });
  canvas.addEventListener("pointerdown", function (e) {
    var rect = canvas.getBoundingClientRect();
    ripple.x = (e.clientX - rect.left) / rect.width;
    ripple.y = (e.clientY - rect.top) / rect.height;
    ripple.t = 0;
  });

  // Pulso de demonstração: uma vez só, pra revelar que o fundo reage a
  // clique — sem isso a interação fica escondida pra quase todo mundo.
  window.setTimeout(function () {
    if (ripple.t > 500) {
      ripple.x = 0.62;
      ripple.y = 0.4;
      ripple.t = 0;
    }
  }, 1600);

  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(
      function (entries) {
        visible = entries[0].isIntersecting;
      },
      { threshold: 0.01 }
    );
    io.observe(canvas.parentElement);
  }
  document.addEventListener("visibilitychange", function () {
    running = document.visibilityState === "visible";
  });

  // -----------------------------------------------------------------
  // Tenta WebGL primeiro.
  // -----------------------------------------------------------------
  var gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
  if (!gl) {
    startCanvas2DFallback();
    return;
  }

  function m4perspective(fovy, aspect, near, far) {
    var f = 1.0 / Math.tan(fovy / 2),
      nf = 1 / (near - far);
    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, 2 * far * near * nf, 0,
    ]);
  }
  function m4lookAt(eye, center, up) {
    function sub(a, b) {
      return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    }
    function norm(a) {
      var l = Math.hypot(a[0], a[1], a[2]) || 1;
      return [a[0] / l, a[1] / l, a[2] / l];
    }
    function cross(a, b) {
      return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
      ];
    }
    var zAxis = norm(sub(eye, center));
    var xAxis = norm(cross(up, zAxis));
    var yAxis = cross(zAxis, xAxis);
    return new Float32Array([
      xAxis[0], yAxis[0], zAxis[0], 0,
      xAxis[1], yAxis[1], zAxis[1], 0,
      xAxis[2], yAxis[2], zAxis[2], 0,
      -(xAxis[0] * eye[0] + xAxis[1] * eye[1] + xAxis[2] * eye[2]),
      -(yAxis[0] * eye[0] + yAxis[1] * eye[1] + yAxis[2] * eye[2]),
      -(zAxis[0] * eye[0] + zAxis[1] * eye[1] + zAxis[2] * eye[2]), 1,
    ]);
  }

  var VERT = [
    "attribute float aRow;",
    "attribute float aX;",
    "attribute float aSide;",
    "uniform mat4 uProj;",
    "uniform mat4 uView;",
    "uniform float uTime;",
    "uniform float uScroll;",
    "uniform vec2 uMouse;",
    "uniform vec2 uRippleOrigin;",
    "uniform float uRippleTime;",
    "varying float vRow;",
    "varying float vHeight;",
    "varying float vGlow;",

    // A mesma forma do traço de pulso usado nos SVGs: uma onda suave
    // com UM pico agudo por ciclo — não um ruído genérico.
    "float pulse(float t) {",
    "  float cyc = fract(t);",
    "  float base = sin(cyc * 6.28318) * 0.22;",
    "  float d = cyc - 0.5;",
    "  float spike = exp(-pow(d * 70.0, 2.0)) * 1.0",
    "    - exp(-pow((d - 0.035) * 90.0, 2.0)) * 0.55;",
    "  return base + spike;",
    "}",

    "void main() {",
    "  float x = (aX - 0.5) * 24.0;",
    "  float z = -2.0 - aRow * 1.55;",
    "  float rowPhase = aRow * 0.6;",
    "  float t = aX * 3.0 + rowPhase - uTime * 0.5 + uScroll * 1.4;",
    "  float h = pulse(t) * 1.1;",

    "  float rd = distance(vec2(aX, aRow / 13.0), uRippleOrigin);",
    "  float ring = sin(rd * 30.0 - uRippleTime * 7.0)",
    "    * exp(-uRippleTime * 1.3) * exp(-rd * 3.0);",
    "  h += ring * 0.8;",

    "  float mouseRowFocus = (uMouse.y * 0.5 + 0.5) * 13.0;",
    "  vGlow = exp(-abs(aRow - mouseRowFocus) / 2.6);",
    "  vRow = aRow / 13.0;",
    "  vHeight = h;",

    "  vec3 pos = vec3(x, h + aSide * 0.045, z);",
    "  gl_Position = uProj * uView * vec4(pos, 1.0);",
    "}",
  ].join("\n");

  var FRAG = [
    "precision mediump float;",
    "varying float vRow;",
    "varying float vHeight;",
    "varying float vGlow;",
    "uniform vec3 uColorDeep;",
    "uniform vec3 uColorAccent;",
    "uniform vec3 uColorGold;",
    "void main() {",
    "  float fog = clamp(1.0 - vRow * 0.85, 0.12, 1.0);",
    "  float intensity = clamp(abs(vHeight) * 0.8 + 0.22, 0.0, 1.0);",
    "  vec3 col = uColorDeep;",
    "  col = mix(col, uColorAccent, intensity * 0.6 * fog);",
    "  col = mix(col, uColorGold, pow(intensity, 1.4) * fog);",
    "  col += vGlow * 0.4 * uColorGold * fog;",
    "  gl_FragColor = vec4(col, 1.0);",
    "}",
  ].join("\n");

  function compile(type, source) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  var vertShader = compile(gl.VERTEX_SHADER, VERT);
  var fragShader = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vertShader || !fragShader) {
    startCanvas2DFallback();
    return;
  }

  var program = gl.createProgram();
  gl.attachShader(program, vertShader);
  gl.attachShader(program, fragShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    startCanvas2DFallback();
    return;
  }
  gl.useProgram(program);

  // Cada linha é uma fita (ribbon) fina em vez de uma linha WebGL de
  // 1px — gl.LINES tem espessura inconsistente entre navegadores/GPUs,
  // uma fita triangulada garante o mesmo acabamento em qualquer lugar.
  var M = 140;
  var rowA = [],
    xA = [],
    sideA = [];
  var rowOffsets = [];
  var rowCounts = [];
  for (var r = 0; r < ROWS; r++) {
    rowOffsets.push(rowA.length);
    for (var i = 0; i <= M; i++) {
      var xn = i / M;
      rowA.push(r, r);
      xA.push(xn, xn);
      sideA.push(-1, 1);
    }
    rowCounts.push((M + 1) * 2);
  }

  function makeBuf(arr) {
    var b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.STATIC_DRAW);
    return b;
  }
  var rowBuf = makeBuf(rowA);
  var xBuf = makeBuf(xA);
  var sideBuf = makeBuf(sideA);

  var aRow = gl.getAttribLocation(program, "aRow");
  var aX = gl.getAttribLocation(program, "aX");
  var aSide = gl.getAttribLocation(program, "aSide");

  var uniforms = {
    uProj: gl.getUniformLocation(program, "uProj"),
    uView: gl.getUniformLocation(program, "uView"),
    uTime: gl.getUniformLocation(program, "uTime"),
    uScroll: gl.getUniformLocation(program, "uScroll"),
    uMouse: gl.getUniformLocation(program, "uMouse"),
    uRippleOrigin: gl.getUniformLocation(program, "uRippleOrigin"),
    uRippleTime: gl.getUniformLocation(program, "uRippleTime"),
    uColorDeep: gl.getUniformLocation(program, "uColorDeep"),
    uColorAccent: gl.getUniformLocation(program, "uColorAccent"),
    uColorGold: gl.getUniformLocation(program, "uColorGold"),
  };

  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0.0627, 0.1255, 0.1137, 1.0); // --bg-deep
  gl.uniform3f(uniforms.uColorDeep, 0.0627, 0.1255, 0.1137); // --bg-deep
  gl.uniform3f(uniforms.uColorAccent, 0.7569, 0.3765, 0.1686); // --accent
  gl.uniform3f(uniforms.uColorGold, 0.9, 0.64, 0.3); // realce claro

  var dpr = Math.min(window.devicePixelRatio || 1, 1.75);
  var proj = m4perspective((48 * Math.PI) / 180, 1, 0.1, 60);

  function resize() {
    var rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    gl.viewport(0, 0, canvas.width, canvas.height);
    proj = m4perspective((48 * Math.PI) / 180, canvas.width / canvas.height, 0.1, 60);
  }
  resize();
  window.addEventListener("resize", resize);

  var clockStart = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    if (!running || !visible) return;

    var t = (now - clockStart) / 1000;
    mouse.x += (mouse.targetX - mouse.x) * 0.06;
    mouse.y += (mouse.targetY - mouse.y) * 0.06;
    ripple.t += 0.016;

    var mx = (mouse.x - 0.5) * 2,
      my = (mouse.y - 0.5) * 2;
    var eye = [mx * 4.0, 5.0 - my * 1.2 - scrollT * 1.0, 8 - scrollT * 15];
    var view = m4lookAt(eye, [0, 0, -18], [0, 1, 0]);

    gl.uniformMatrix4fv(uniforms.uProj, false, proj);
    gl.uniformMatrix4fv(uniforms.uView, false, view);
    gl.uniform1f(uniforms.uTime, t);
    gl.uniform1f(uniforms.uScroll, scrollT);
    gl.uniform2f(uniforms.uMouse, mx, -my);
    gl.uniform2f(uniforms.uRippleOrigin, ripple.x, ripple.y);
    gl.uniform1f(uniforms.uRippleTime, ripple.t);

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.bindBuffer(gl.ARRAY_BUFFER, rowBuf);
    gl.enableVertexAttribArray(aRow);
    gl.vertexAttribPointer(aRow, 1, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, xBuf);
    gl.enableVertexAttribArray(aX);
    gl.vertexAttribPointer(aX, 1, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, sideBuf);
    gl.enableVertexAttribArray(aSide);
    gl.vertexAttribPointer(aSide, 1, gl.FLOAT, false, 0, 0);

    for (var r = 0; r < ROWS; r++) {
      gl.drawArrays(gl.TRIANGLE_STRIP, rowOffsets[r], rowCounts[r]);
    }
  }
  requestAnimationFrame(frame);

  // -----------------------------------------------------------------
  // Fallback Canvas2D — linhas de fluxo com a mesma forma de onda
  // (base suave + um pico agudo por ciclo), reagindo a mouse e scroll.
  // -----------------------------------------------------------------
  function startCanvas2DFallback() {
    var ctx = canvas.getContext("2d");
    if (!ctx) return;

    var W, H;
    function resize2d() {
      var rect = canvas.parentElement.getBoundingClientRect();
      W = canvas.width = Math.max(1, Math.round(rect.width));
      H = canvas.height = Math.max(1, Math.round(rect.height));
    }
    resize2d();
    window.addEventListener("resize", resize2d);

    var COLORS = ["rgba(193,96,43,", "rgba(224,137,90,", "rgba(245,239,230,"];

    function pulse(t) {
      var cyc = t - Math.floor(t);
      var base = Math.sin(cyc * Math.PI * 2) * 0.22;
      var d = cyc - 0.5;
      var spike =
        Math.exp(-Math.pow(d * 70, 2)) * 1.0 -
        Math.exp(-Math.pow((d - 0.035) * 90, 2)) * 0.55;
      return base + spike;
    }

    function draw(now) {
      requestAnimationFrame(draw);
      if (!running || !visible) return;
      var t = now / 1000;
      var mx = mouse.x * W,
        my = mouse.y * H;

      ctx.fillStyle = "#10201d";
      ctx.fillRect(0, 0, W, H);

      for (var i = 0; i < ROWS; i++) {
        var baseY = ((i + 0.5) / ROWS) * H;
        var distMouseY = Math.abs(baseY - my);
        var rowGlow = Math.exp(-distMouseY / (H * 0.22));
        var flowSpeed = 0.35 + scrollT * 0.4;

        ctx.beginPath();
        var step = 6;
        for (var x = 0; x <= W; x += step) {
          var distMouseX = Math.abs(x - mx);
          var mouseBoost =
            Math.exp(-((distMouseX * distMouseX) + (distMouseY * distMouseY)) / (W * 40)) *
            (14 + scrollT * 8);
          var wave = pulse(x / W * 2.2 + i * 0.35 - t * flowSpeed) * (30 + rowGlow * 22);
          var y = baseY + wave - mouseBoost;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        var color = COLORS[i % COLORS.length];
        var alpha = 0.1 + rowGlow * 0.5;
        ctx.strokeStyle = color + alpha + ")";
        ctx.lineWidth = 1.2 + rowGlow * 1.8;
        ctx.shadowColor = "rgba(224,137,90,0.85)";
        ctx.shadowBlur = 5 + rowGlow * 16;
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
    }
    requestAnimationFrame(draw);
  }
})();
