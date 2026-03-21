(() => {
  'use strict';

  // Respect reduced motion.
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const canvas = document.getElementById('fluid-bg');
  if (!canvas || prefersReducedMotion) return;

  /**
   * A lightweight “fluid-like” background using a fragment shader with
   * domain-warped fractal noise.
   *
   * Model sketch (not a full Navier–Stokes sim):
   *   p' = p + A * W(p, t)
   *   g  = mix3(c1,c2,c3, y(p') + B * f(p', t))
   * where W and f are smooth noise fields (fbm), producing convincing swirls.
   */

  const VERT = `
    attribute vec2 a_pos;
    varying vec2 v_uv;
    void main() {
      v_uv = a_pos * 0.5 + 0.5;
      gl_Position = vec4(a_pos, 0.0, 1.0);
    }
  `;

  // Classic simplex noise (Ashima Arts), then fbm + domain warping.
  const FRAG = `
    precision highp float;

    varying vec2 v_uv;
    uniform vec2 u_res;
    uniform float u_time;
    uniform vec2 u_mouse;

    // --- simplex noise (2D) ---
    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

    float snoise(vec2 v) {
      const vec4 C = vec4(
        0.211324865405187,  // (3.0-sqrt(3.0))/6.0
        0.366025403784439,  // 0.5*(sqrt(3.0)-1.0)
        -0.577350269189626, // -1.0 + 2.0 * C.x
        0.024390243902439   // 1.0 / 41.0
      );

      vec2 i  = floor(v + dot(v, C.yy));
      vec2 x0 = v - i + dot(i, C.xx);

      vec2 i1;
      i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
      vec4 x12 = x0.xyxy + C.xxzz;
      x12.xy -= i1;

      i = mod289(i);
      vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));

      vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
      m = m*m;
      m = m*m;

      vec3 x = 2.0 * fract(p * C.www) - 1.0;
      vec3 h = abs(x) - 0.5;
      vec3 ox = floor(x + 0.5);
      vec3 a0 = x - ox;

      m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);

      vec3 g;
      g.x  = a0.x  * x0.x  + h.x  * x0.y;
      g.yz = a0.yz * x12.xz + h.yz * x12.yw;

      return 130.0 * dot(m, g);
    }

    float fbm(vec2 p) {
      // 5 octaves, tuned for smooth “ink-in-water” motion.
      float f = 0.0;
      float a = 0.5;
      mat2 rot = mat2(0.80, -0.60, 0.60, 0.80);
      for (int i = 0; i < 5; i++) {
        f += a * snoise(p);
        p = rot * p * 2.02;
        a *= 0.52;
      }
      return f;
    }

    vec3 mix3(vec3 c1, vec3 c2, vec3 c3, float t, float mid) {
      // Piecewise linear mixing like:
      // C(t) = lerp(c1,c2,t/mid) if t<=mid else lerp(c2,c3,(t-mid)/(1-mid))
      if (t <= mid) {
        float a = clamp(t / mid, 0.0, 1.0);
        return mix(c1, c2, a);
      } else {
        float b = clamp((t - mid) / (1.0 - mid), 0.0, 1.0);
        return mix(c2, c3, b);
      }
    }

    void main() {
      // Normalize coordinates with aspect correction.
      vec2 uv = v_uv;
      vec2 p = (uv - 0.5);
      p.x *= u_res.x / u_res.y;

      // Time scaling.
      float t = u_time;

      // Mouse influence (subtle): adds a slow “eddy” around pointer.
      vec2 m = (u_mouse / max(u_res, vec2(1.0))) - 0.5;
      m.x *= u_res.x / u_res.y;
      float md = length(p - m);
      // Slightly stronger eddy so motion is noticeable when hovering.
      float mInfluence = exp(-md * 3.0) * 0.16;

      // Domain warp: p' = p + A * W(p,t)
      vec2 w1 = vec2(
        fbm(p * 1.20 + vec2(0.0, t * 0.04)),
        fbm(p * 1.20 + vec2(5.2, -t * 0.035))
      );
      vec2 w2 = vec2(
        fbm((p + 1.7*w1) * 1.85 + vec2(2.1, t * 0.06)),
        fbm((p + 1.7*w1) * 1.85 + vec2(8.3, -t * 0.055))
      );

      // Stronger warp so the “fluid” is easier to perceive.
      vec2 pw = p + 0.62 * w1 + 0.34 * w2;
      pw += mInfluence * vec2(-(p.y - m.y), (p.x - m.x)); // swirl around mouse

      // Flow field for vertical distortion.
      float f = fbm(pw * 1.15 + vec2(0.0, t * 0.08));
      float f2 = fbm(pw * 2.20 + vec2(3.7, -t * 0.06));
      float flow = 0.65 * f + 0.35 * f2;

      // Base gradient coordinate (0..1), then distort by flow.
      float mid = 0.55;
      // Increase vertical advection so the background reads as “moving”.
      float y = clamp(uv.y + 0.22 * flow, 0.0, 1.0);

      // Palette close to your screenshot's background.
      vec3 c1 = vec3(0.6039, 0.7333, 0.9451); // ~ #9ABBF1
      vec3 c2 = vec3(0.7804, 0.7922, 0.9569); // ~ #C7CAF4
      vec3 c3 = vec3(0.8863, 0.9216, 0.9765); // ~ #E2EBF9

      vec3 col = mix3(c1, c2, c3, y, mid);

      // Add subtle “caustic” highlight via local slope of flow.
      float eps = 1.0 / max(u_res.y, 720.0);
      float fx = fbm((pw + vec2(eps, 0.0)) * 1.15 + vec2(0.0, t * 0.08)) -
                 fbm((pw - vec2(eps, 0.0)) * 1.15 + vec2(0.0, t * 0.08));
      float fy = fbm((pw + vec2(0.0, eps)) * 1.15 + vec2(0.0, t * 0.08)) -
                 fbm((pw - vec2(0.0, eps)) * 1.15 + vec2(0.0, t * 0.08));

      vec3 n = normalize(vec3(-fx, -fy, 0.9));
      vec3 lightDir = normalize(vec3(0.25, 0.35, 1.0));
      float diff = clamp(dot(n, lightDir), 0.0, 1.0);

      // Texture grain (very low amplitude) to avoid flat digital look.
      float grain = snoise(uv * u_res / 220.0 + vec2(t * 0.12, -t * 0.07));

      // Stronger lighting + a tiny chroma modulation tied to flow to make
      // the motion visible even with a pastel palette.
      col += 0.075 * pow(diff, 2.0);
      col += 0.012 * grain;

      // Chroma drift (pink↔blue) driven by the flow field.
      col += 0.040 * flow * vec3(0.55, 0.10, -0.35);

      // Mild contrast boost (kept small to avoid banding).
      col = (col - 0.5) * 1.10 + 0.5;

      // Gentle vignetting.
      float vign = smoothstep(1.05, 0.15, length(p));
      col = mix(col, col * 0.985, 1.0 - vign);

      // Keep in gamut.
      col = clamp(col, 0.0, 1.0);
      gl_FragColor = vec4(col, 1.0);
    }
  `;

  function createShader(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(sh) || 'unknown shader error';
      gl.deleteShader(sh);
      throw new Error(info);
    }
    return sh;
  }

  function createProgram(gl, vsSrc, fsSrc) {
    const vs = createShader(gl, gl.VERTEX_SHADER, vsSrc);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSrc);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(prog) || 'unknown link error';
      gl.deleteProgram(prog);
      throw new Error(info);
    }
    return prog;
  }

  let gl = null;
  try {
    gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance'
    });
  } catch (_) {
    gl = null;
  }

  if (!gl) {
    // Keep static CSS fallback (defined in personal.css).
    return;
  }

  let program;
  try {
    program = createProgram(gl, VERT, FRAG);
  } catch (e) {
    // Keep static CSS fallback.
    // eslint-disable-next-line no-console
    console.warn('[fluid-bg] shader error:', e);
    return;
  }

  const locPos = gl.getAttribLocation(program, 'a_pos');
  const locRes = gl.getUniformLocation(program, 'u_res');
  const locTime = gl.getUniformLocation(program, 'u_time');
  const locMouse = gl.getUniformLocation(program, 'u_mouse');

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1
    ]),
    gl.STATIC_DRAW
  );

  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(window.innerWidth * dpr));
    const h = Math.max(1, Math.floor(window.innerHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  }

  let mouseX = 0;
  let mouseY = 0;
  const onPointer = (ev) => {
    const x = (ev.touches && ev.touches[0] ? ev.touches[0].clientX : ev.clientX) || 0;
    const y = (ev.touches && ev.touches[0] ? ev.touches[0].clientY : ev.clientY) || 0;
    mouseX = x * dpr;
    mouseY = (window.innerHeight - y) * dpr; // flip Y for shader convenience
  };

  window.addEventListener('mousemove', onPointer, { passive: true });
  window.addEventListener('touchmove', onPointer, { passive: true });
  window.addEventListener('resize', resize, { passive: true });

  resize();

  const t0 = performance.now();
  function frame(now) {
    resize();

    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(locPos);
    gl.vertexAttribPointer(locPos, 2, gl.FLOAT, false, 0, 0);

    gl.uniform2f(locRes, canvas.width, canvas.height);
    // Slightly faster evolution so the movement is perceptible without feeling busy.
    gl.uniform1f(locTime, (now - t0) / 1000.0 * 1.18);
    gl.uniform2f(locMouse, mouseX, mouseY);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();
