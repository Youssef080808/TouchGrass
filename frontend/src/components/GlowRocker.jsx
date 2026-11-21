// Glow Rocker by Louis Studios (https://studios.lou15.com), via 21st.dev. Converted from TypeScript to plain JSX
// for Turfed. Our changes: the default font, and the dotsFromTop option.
//
// A 3D rocker switch drawn with WebGL (with a canvas 2D fallback). Pressing it rocks the plate over; when it's
// on, the scene goes dark and the edge glows. It only draws while something is moving, so it costs nothing at rest.
//
// Props: checked / defaultChecked / onChange(next) like a checkbox; view 'iso' | 'close' | 'top';
// glowColor (wall and leaking light), lightColor / darkColor (scene when off / on), labelColor (lit labels and dots);
// onLabel / offLabel (the two halves), topLabel / bottomLabel (ends of the dotted line); font; dots;
// dotsFromTop (light the dotted line from the topLabel end instead of the bottomLabel end);
// duration (ms per rock); orbit (degrees the camera follows a mouse, 0 = off); ariaLabel; className; style.
import * as React from 'react'
/* ------------------------------------------------------------------ */
/* Measured from the reference film (277 frames at 25 fps).            */
/* World unit is the pill radius. +y is the OFF end, +z is up.         */
/* ------------------------------------------------------------------ */
const HALF = 1.53 // half length of the straight part of the pill
const LEN = 2.53 // hinge to tip
const TILT = 0.276 // how far a half swings up about the hinge, in radians
const PLATE = 0.032 // thickness of the grey top plate
const DOT_X = 1.374 // dotted line, to the right of the pill
const DOT_Y0 = -1.9425
const DOT_Y1 = 1.9788
const DOT_R = 0.042
const SIDE_X = 1.374 // the side labels sit on the dotted line
const OFF_Y = 1.86 // label centres on the plate
const ON_Y = -1.86
const TOP_Y = 2.33 // label centres beside the dotted line
const BOT_Y = -2.45
const CAP_PLATE = 0.32 // cap height of the plate labels
const CAP_SIDE = 0.26 // cap height of the side labels
/* The rock is an exponential ease in that snaps home at the cut. */
const ON_FRAMES = 26
const ON_A = 0.01466
const ON_K = 0.157 * ON_FRAMES
const OFF_FRAMES = 30
const OFF_A = 0.00264
const OFF_K = 0.19 * OFF_FRAMES
/* Frames before the flip at which each dot switches (19 dots in the film). */
const DOTS_ON = [18, 15, 12, 10, 9, 8, 6, 5, 4, 4, 3, 2, 2, 1, 1, 1, 0, 0, 0]
const DOTS_OFF = [14, 12, 11, 9, 8, 7, 6, 5, 4, 4, 3, 2, 2, 1, 1, 0, 0, 0, 0]
/* The film's edit: [first frame, length, dark scene, view, local frame it starts on]. */
const FPS = 25
const CUTS = [
  [0, 25, 0, 'iso', 1],
  [25, 30, 1, 'iso', 0],
  [55, 26, 0, 'iso', 0],
  [81, 30, 1, 'iso', 0],
  [111, 25, 0, 'close', 1],
  [136, 30, 1, 'close', 0],
  [166, 25, 0, 'top', 1],
  [191, 30, 1, 'top', 0],
  [221, 26, 0, 'top', 0],
  [247, 30, 1, 'top', 0],
]
const LOOP_FRAMES = 277
const VIEWS = {
  iso: { az: 48.4, el: 31, dist: 30, zoom: 120, tx: -0.01, ty: 0.33, need: 760, roll: 0.4, gain: 1, dim: 1 },
  close: { az: 102.3, el: 38.6, dist: 30, zoom: 297, tx: 0.42, ty: 1.66, need: 760, roll: -9.6, gain: 1.2, dim: 0.2 },
  top: { az: 0, el: 89.9, dist: 40, zoom: 170, tx: 0.245, ty: 0.043, need: 1010, roll: 0, gain: 1, dim: 0.48 },
}
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x)
const mix = (a, b, t) => a + (b - a) * t
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const rockOn = (u) => (u >= 1 ? 1 : ON_A * (Math.exp(ON_K * u) - 1))
const rockOff = (u) => (u >= 1 ? 1 : OFF_A * (Math.exp(OFF_K * u) - 1))
const unrockOn = (p) => clamp01(Math.log(Math.max(p, 0) / ON_A + 1) / ON_K)
const unrockOff = (p) => clamp01(Math.log(Math.max(p, 0) / OFF_A + 1) / OFF_K)
/** How many of `n` dots have switched when `rem` frames are left before the flip. */
function switched(table, rem, n) {
  let c = 0
  for (let i = 0; i < n; i++) {
    const f = n > 1 ? (i * (table.length - 1)) / (n - 1) : 0
    const a = Math.floor(f)
    const b = Math.min(table.length - 1, a + 1)
    if (mix(table[a], table[b], f - a) >= rem - 1e-3) c++
  }
  return c
}
const litOn = (u, n) => (u >= 1 ? n : switched(DOTS_ON, ON_FRAMES * (1 - u), n))
const litOff = (u, n) => (u >= 1 ? 0 : n - switched(DOTS_OFF, OFF_FRAMES * (1 - u), n))
function mixCam(a, b, t) {
  return {
    az: mix(a.az, b.az, t),
    el: mix(a.el, b.el, t),
    dist: mix(a.dist, b.dist, t),
    zoom: Math.exp(mix(Math.log(a.zoom), Math.log(b.zoom), t)),
    tx: mix(a.tx, b.tx, t),
    ty: mix(a.ty, b.ty, t),
    need: mix(a.need, b.need, t),
    roll: mix(a.roll, b.roll, t),
    gain: mix(a.gain, b.gain, t),
    dim: mix(a.dim, b.dim, t),
  }
}
/** Any CSS colour to 0..1 rgb, read back from a canvas so every syntax works. */
function parseColor(c, fallback) {
  try {
    const cv = document.createElement('canvas')
    cv.width = cv.height = 1
    const x = cv.getContext('2d')
    if (!x) return fallback
    x.fillStyle = '#000000' // ls:keep
    x.fillStyle = c
    x.fillRect(0, 0, 1, 1)
    const d = x.getImageData(0, 0, 1, 1).data
    return [d[0] / 255, d[1] / 255, d[2] / 255]
  } catch {
    return fallback
  }
}
/* ------------------------------------------------------------------ */
/* Label atlas: four rows, regular weight in red, heavy weight in green */
/* ------------------------------------------------------------------ */
const ATLAS = 1024
const ROW = ATLAS / 4
const CAP_FRAC = 0.45 // cap height as a share of the row
function drawAtlas(labels, font) {
  const cv = document.createElement('canvas')
  cv.width = cv.height = ATLAS
  const x = cv.getContext('2d')
  if (!x) return cv
  x.fillStyle = '#000000' // ls:keep
  x.fillRect(0, 0, ATLAS, ATLAS)
  x.globalCompositeOperation = 'lighter'
  x.textAlign = 'center'
  x.textBaseline = 'alphabetic'
  const cap = ROW * CAP_FRAC
  for (let r = 0; r < 4; r++) {
    const text = labels[r]
    if (!text) continue
    for (let w = 0; w < 2; w++) {
      const weight = w ? 600 : 400
      x.font = `${weight} 100px ${font}`
      const m = x.measureText('H')
      const capPx = m.actualBoundingBoxAscent || 71
      const size = (100 * cap) / capPx
      x.font = `${weight} ${size.toFixed(2)}px ${font}`
      x.fillStyle = w ? '#00ff00' : '#ff0000' // ls:keep
      // the plate labels must stay inside the pill, the side labels inside their row
      const maxW = r < 2 ? ATLAS * 0.6 : ATLAS * 0.92
      x.fillText(text, ATLAS / 2, r * ROW + ROW / 2 + cap / 2, maxW)
    }
  }
  return cv
}
/* ------------------------------------------------------------------ */
/* Shader: one full screen pass that raymarches the rocker             */
/* ------------------------------------------------------------------ */
const VERT = `attribute vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`
const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes;
uniform float uScale;
uniform vec4 uCam;
uniform vec4 uTgt;
uniform float uDim;
uniform float uPose;
uniform float uDark;
uniform float uBloom;
uniform float uLit;
uniform float uDots;
uniform float uDotsRev;
uniform vec3 uGlow;
uniform vec3 uLight;
uniform vec3 uShade;
uniform vec3 uInk;
uniform sampler2D uText;

const float A = ${HALF.toFixed(3)};
const float L = ${LEN.toFixed(3)};
const float TH = ${TILT.toFixed(4)};
const float TP = ${PLATE.toFixed(3)};
const float RB = 0.014;
const float DX = ${DOT_X.toFixed(4)};
const float DY0 = ${DOT_Y0.toFixed(4)};
const float DY1 = ${DOT_Y1.toFixed(4)};
const float DR = ${DOT_R.toFixed(3)};
const float AMB = 0.06;
const vec2 SUN2 = vec2(-0.788, -0.616);
const vec3 SUN = vec3(-0.711, -0.556, 0.431);
const vec3 KEYA = vec3(-0.719, -0.000, 0.695);
const vec3 KEYB = vec3(-0.439, -0.369, 0.819);
const float SOFTA = 0.45;
const float SOFTB = 0.8;

vec3 kOff;
vec3 kOn;
vec3 gView;
float gTop;
float pw;
vec3 gGlow;
vec3 gLight;
vec3 gShade;
vec3 gInk;

vec3 toLin(vec3 c){ return pow(c, vec3(2.2)); }

/* sin, cos and half angle tangent of the tilt of the half a point belongs to */
vec3 hv(float y){ return y > 0.0 ? kOff : kOn; }
float sd2(vec2 p){ return length(vec2(p.x, max(abs(p.y) - A, 0.0))) - 1.0; }
vec2 grad2(vec2 p){
  vec2 q = vec2(p.x, sign(p.y) * max(abs(p.y) - A, 0.0));
  return q / max(length(q), 1e-4);
}
/* height of the rocker above the floor: the tilted plate, or the wall that leans in under its rim */
float hgt(vec2 q){
  vec3 k = hv(q.y);
  float ay = abs(q.y);
  float yb = A + sqrt(max(1.0 - q.x * q.x, 0.0));
  float h = min(ay * k.x / k.y, (yb - ay) / max(k.z, 0.002));
  return abs(q.x) < 1.0 ? max(h, 0.0) : 0.0;
}
/* xy: where on the plate a point sits, z: its height above the top face */
vec3 plateCo(vec3 p){
  vec3 k = hv(p.y);
  float ay = abs(p.y);
  return vec3(p.x, (p.y > 0.0 ? 1.0 : -1.0) * (ay * k.y + p.z * k.x), p.z * k.y - ay * k.x);
}
float body(vec3 p){
  vec3 k = hv(p.y);
  float ay = abs(p.y);
  vec2 w = vec2(sd2(vec2(p.x, ay + p.z * k.z)) * 0.87, p.z * k.y - ay * k.x) + RB;
  return min(max(w.x, w.y), 0.0) + length(max(w, 0.0)) - RB;
}
vec3 bodyNormal(vec3 p){
  vec2 e = vec2(1.0, -1.0) * 0.004;
  return normalize(e.xyy * body(p + e.xyy) + e.yyx * body(p + e.yyx) + e.yxy * body(p + e.yxy) + e.xxx * body(p + e.xxx));
}
/* distance to the glowing wall of one half; the wall only counts where it has some height */
float lampHalf(vec3 p, float yy, vec3 k){
  float y0 = yy + p.z * k.z;
  float ymin = 0.02 / max(k.x, 0.001);
  float s = length(vec2(p.x, max(y0 - A, 0.0))) - 1.0;
  float ht = max(min(max(y0, ymin), L) * k.x - TP, 0.0);
  return length(vec3(abs(s), max(p.z - ht, 0.0), max(ymin - y0, 0.0)));
}
float lamp(vec3 p){ return min(lampHalf(p, p.y, kOff), lampHalf(p, -p.y, kOn)); }

/* soft shadow of the rocker on the floor toward one part of the large light: the closer
   the ray passes the body, the less of that part is seen */
float shadow1(vec2 xy, vec3 key, float soft){
  float res = 1.0;
  float t = 0.03;
  float ph = 1000.0;
  for (int i = 0; i < 20; i++) {
    float h = body(vec3(xy, 0.004) + key * t);
    if (h < 0.0015) { res = 0.0; break; }
    float y = h * h / (2.0 * ph);
    float d = sqrt(max(h * h - y * y, 0.0));
    res = min(res, d / max(t - y, 0.0001));
    ph = h;
    t += clamp(h, 0.03, 0.22);
    if (t > 3.2) break;
  }
  res = clamp(res / soft, 0.0, 1.0);
  return res * res * (3.0 - 2.0 * res);
}
/* the light is wide, so two parts of it are sampled and averaged */
float shadow(vec2 xy){ return 0.5 * (shadow1(xy, KEYA, SOFTA) + shadow1(xy, KEYB, SOFTB)); }

/* light a vertical glowing strip of height h throws on the floor at distance d */
float strip(float d, float h){
  d = max(d, 0.0);
  return 0.5 * (1.0 - d / sqrt(d * d + h * h + 1e-5));
}

/* x: regular weight, y: heavy weight, z: soft halo of the heavy weight, w: 1 on the far (+y) half */
vec4 labels(vec2 xy, float plate){
  float up = step(0.0, xy.y);
  vec2 c = plate > 0.5 ? vec2(0.0, mix(${ON_Y.toFixed(3)}, ${OFF_Y.toFixed(3)}, up)) : vec2(${SIDE_X.toFixed(3)}, mix(${BOT_Y.toFixed(3)}, ${TOP_Y.toFixed(3)}, up));
  float cap = plate > 0.5 ? ${CAP_PLATE.toFixed(3)} : ${CAP_SIDE.toFixed(3)};
  float row = plate > 0.5 ? mix(2.0, 3.0, up) : mix(0.0, 1.0, up);
  vec2 cell = vec2(4.0, 1.0) * cap / ${CAP_FRAC.toFixed(3)};
  vec2 uv = (xy - c) / cell + 0.5;
  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  uv = clamp(uv, 0.003, 0.997);
  vec2 st = vec2(uv.x, (row + uv.y) * 0.25);
  vec3 a = texture2D(uText, st).rgb;
  vec3 b = texture2D(uText, st, 1.6).rgb;
  vec2 ed = smoothstep(vec2(0.0), vec2(0.06, 0.2), uv) * smoothstep(vec2(1.0), vec2(0.94, 0.8), uv);
  return vec4(a.r * inside, a.g * inside, b.g * inside * ed.x * ed.y, up);
}

/* the top face of the plate, lifted or lying flush in the floor */
vec3 plateColor(vec2 xy, float lam, float sh, float tilt){
  vec4 t = labels(xy, 1.0);
  // light scene: OFF is the bright label, ON is ink
  vec3 lightCol = gLight * (AMB + (1.0 - AMB) * lam * sh);
  vec3 inkLightCol = toLin(vec3(0.31, 0.31, 0.31));
  lightCol = mix(lightCol, inkLightCol, t.x * (1.0 - t.w));
  lightCol = mix(lightCol, gInk, mix(t.x, t.y, 0.2) * t.w) + gInk * t.z * t.w * 0.1;
  // dark scene: ON is the bright label, OFF is dim; a faint key light still models the tilt
  vec3 darkCol = gShade * uDim * clamp(1.0 + 4.8 * tilt, 0.3, 3.0);
  vec3 inkDarkCol = toLin(vec3(0.65, 0.65, 0.65));
  darkCol = mix(darkCol, inkDarkCol, mix(t.x, t.y, 0.35) * t.w);
  darkCol = mix(darkCol, gInk, t.y * (1.0 - t.w)) + gInk * t.z * (1.0 - t.w) * 0.1;
  return mix(lightCol, darkCol, uDark);
}

/* how much light the top face of one half catches at its tilt, 1 when it lies flat */
float topLam(float sg, vec3 k){
  float lam = max(dot(vec3(0.0, -sg * k.x, k.y), SUN), 0.0) / SUN.z;
  return min(lam, 1.0) + max(lam - 1.0, 0.0) * 0.47;
}
vec3 shadeBody(vec3 p){
  vec3 n = bodyNormal(p);
  vec3 k = hv(p.y);
  float sg = p.y > 0.0 ? 1.0 : -1.0;
  vec3 pc = plateCo(p);
  vec3 nTop = vec3(0.0, -sg * k.x, k.y);
  float lam = max(dot(n, SUN), 0.0);
  float top = smoothstep(0.6, 0.92, dot(n, nTop));
  float wall = 1.0 - smoothstep(-TP - pw, -TP + pw, pc.z);
  wall *= smoothstep(-0.2, -0.14, sd2(p.xy));
  float ht = min(abs(p.y) + p.z * k.z, L) * k.x;
  float tall = smoothstep(0.0, 0.5, ht);
  // plate: top face and its thin grey edge
  vec3 topCol = plateColor(pc.xy, topLam(sg, k), 1.0, sg * k.x);
  vec3 rimLightCol = gLight * (AMB + (1.0 - AMB) * (0.4 + lam) * 1.1);
  rimLightCol = mix(rimLightCol, gGlow + vec3(0.55, 0.45, 0.6), 0.05);
  // by night the edge that faces the lens sits in the plate's own shade
  vec3 rimDarkCol = gShade * uDim * 0.4 + gGlow * 0.05;
  vec3 plate = mix(mix(rimLightCol, rimDarkCol, uDark), topCol, top);
  // wall: violet body in the light scene, a lamp in the dark scene
  float lam2 = dot(normalize(n.xy + vec2(0.0001, 0.0)), SUN2);
  float lit = clamp((lam2 - 0.1) / 0.9, 0.0, 1.0);
  float base = mix(0.14, 0.63, smoothstep(-0.95, 0.2, lam2)) - 0.27 * smoothstep(0.5, 1.0, lam2);
  float warm = 0.11 * smoothstep(-0.3, 0.3, lam2) * (1.0 - smoothstep(0.7, 1.0, lam2));
  vec3 sunlitCol = vec3(0.8, 0.5, 0.62);
  vec3 warmCol = vec3(1.0, 0.0, 0.0);
  vec3 wallLightCol = gGlow * base + sunlitCol * 0.8 * lit * sqrt(lit) + warmCol * warm;
  // the side turned away from the light falls off toward its foot
  float rise = max(smoothstep(0.0, 0.9, p.z / max(ht, 0.04)), 1.0 - smoothstep(0.02, 0.12, ht));
  wallLightCol *= mix(1.0, mix(0.12, 1.25, rise), 1.0 - smoothstep(-0.7, -0.2, lam2));
  // the rounded end catches a little fill light, the side straight across from the sun gets the least
  float endOn = max(n.y * sg, 0.0);
  wallLightCol *= (1.0 + 0.5 * endOn * endOn * (1.0 - smoothstep(-0.3, 0.2, lam2))) * mix(0.7, 1.0, smoothstep(-1.0, -0.8, lam2));
  float limb = smoothstep(-0.05, 0.3, dot(n, gView));
  vec3 wallDarkCol = mix(gGlow * 1.6, gGlow * 0.6 + vec3(1.2, 0.75, 0.5), limb);
  vec3 side = mix(wallLightCol, wallDarkCol, uDark);
  gTop = top * (1.0 - wall);
  return mix(plate, side, wall * (1.0 - top));
}

vec3 shadeGround(vec2 xy){
  float s = sd2(xy);
  vec2 g = grad2(xy);
  vec2 q = xy - g * s;
  vec3 kq = hv(q.y);
  float lift = max(min(abs(q.y), L) * kq.x - TP, 0.0);
  float lifted = smoothstep(0.0, 0.03, lift);
  float gs = dot(g, SUN2);
  float sh = uDark < 0.999 && s < 2.4 ? shadow(xy) : 1.0;
  // the light is wide: only the floor right at the plate goes fully dark
  sh = mix(sh, 1.0, 0.36 * smoothstep(0.0, 0.3, s) * (1.0 - 0.75 * smoothstep(0.12, 0.36, lift) * step(0.0, q.y)));
  // the seam where the plate lies in the floor: a fine groove with one lit ledge
  float sa = s + 0.004;
  float sb = sa + 0.03 * gs;
  float flush = 1.0 - lifted;
  float groove = exp(-sa * sa / 0.00008) * flush;
  float ledge = exp(-sb * sb / 0.00014) * flush;
  vec3 col;
  if (s < 0.0) {
    vec3 kx = hv(xy.y);
    float sx = xy.y > 0.0 ? 1.0 : -1.0;
    col = plateColor(xy, topLam(sx, kx), 1.0, sx * kx.x);
  } else {
    float f = strip(s, lift + 0.012);
    float facing = max(gs, 0.0);
    // light scene: soft shadow and a violet bounce off the wall
    vec3 lightCol = gLight * (AMB + (1.0 - AMB) * sh);
    vec3 bounceCol = (gGlow + vec3(0.25, 0.25, 0.25)) * gLight * 0.55;
    lightCol += bounceCol * f * lifted * (0.1 + facing);
    // dark scene: the wall lights the floor
    float tip = clamp(abs(q.y) - A, 0.0, 1.0);
    float raw = max(min(abs(q.y), L) * kq.x - 0.6 * TP, 0.0);
    float open = smoothstep(0.0, 0.02, raw);
    float sr = s / (0.34 + 0.95 * raw);
    float pool = 1.7 * strip(s, raw * mix(1.65, 1.0, tip) + 0.012) / (1.0 + sr * sr * sr) * open;
    vec3 deepCol = pow(gGlow, vec3(1.25));
    vec3 warmCol = vec3(0.25, 0.01, 0.0);
    vec3 darkCol = gShade * uDim + deepCol * pool + warmCol * pool * pool;
    vec3 hotCol = vec3(1.0, 0.5, 0.6);
    darkCol += hotCol * 0.9 * exp(-s * 30.0) * smoothstep(0.01, 0.07, raw);
    col = mix(lightCol, darkCol, uDark);

    // side labels
    vec4 t = labels(xy, 0.0);
    vec3 inkCol = toLin(vec3(0.47, 0.47, 0.47));
    col = mix(mix(col, inkCol * (0.3 + 0.7 * sh), t.x), mix(col, gInk, t.y) + gInk * t.z * 0.22, uDark);

    // dotted line: small pits in the floor that fill with light
    float sp = (DY1 - DY0) / max(uDots - 1.0, 1.0);
    float di = clamp(floor((xy.y - DY0) / sp + 0.5), 0.0, uDots - 1.0);
    vec2 dv = xy - vec2(DX, DY0 + di * sp);
    float dd = length(dv);
    float disc = smoothstep(DR + pw, DR - pw, dd);
    float on = step(mix(di, uDots - 1.0 - di, uDotsRev) + 0.5, uLit);
    float side = dot(dv, SUN2) / DR;
    vec3 pitLightCol = mix(gLight, toLin(vec3(0.56, 0.58, 0.72)), 0.5) * (0.9 - 0.42 * side) * (0.55 + 0.45 * sh);
    pitLightCol += gInk * 0.5 * sh * sh * smoothstep(0.55, 0.0, length(dv + SUN2 * DR * 0.4) / DR);
    vec3 pitDarkCol = gShade * uDim + gGlow * 0.14;
    vec3 offCol = mix(pitLightCol, pitDarkCol, uDark);
    vec3 onCol = gInk * 0.87;
    float ring = smoothstep(DR * 1.5, DR, dd) * (1.0 - disc) * (1.0 - uDark) * (1.0 - on);
    col *= 1.0 - 0.1 * ring * side;
    col = mix(col, mix(offCol, onCol, on), disc);
    col += gInk * on * 0.14 * exp(-max(dd - DR, 0.0) * 26.0) * (1.0 - disc) * (0.35 - 0.25 * uDark);
  }
  vec3 seamLightCol = col * (1.0 - 0.5 * groove) * (1.0 + 0.3 * ledge * abs(gs));
  // by night light leaks out all round the plate, lifted or not
  float sl = s - 0.008;
  vec3 seamDarkCol = col + gGlow * (0.42 * exp(-sl * sl / 0.0003) * (0.6 + 0.4 * abs(gs)) + 0.06 * exp(-abs(sl) / 0.04));
  return mix(seamLightCol, seamDarkCol, uDark);
}

void main(){
  gGlow = toLin(uGlow);
  gLight = toLin(uLight);
  gShade = toLin(uShade);
  gInk = toLin(uInk);
  float aOff = clamp(uPose, -0.08, 1.08) * TH;
  float aOn = clamp(1.0 - uPose, -0.08, 1.08) * TH;
  aOff = max(aOff, 0.0);
  aOn = max(aOn, 0.0);
  kOff = vec3(sin(aOff), cos(aOff), tan(aOff * 0.5));
  kOn = vec3(sin(aOn), cos(aOn), tan(aOn * 0.5));
  pw = 1.0 / (uCam.w * uScale);

  vec2 fc = (gl_FragCoord.xy - 0.5 * uRes) / uScale;
  float az = radians(uCam.x);
  float el = radians(uCam.y);
  float ro2 = radians(uTgt.z);
  vec3 rgt = vec3(cos(az), sin(az), 0.0);
  vec2 fwd = vec2(-sin(az), cos(az));
  vec3 back = vec3(-fwd * cos(el), sin(el));
  vec3 up = vec3(fwd * sin(el), cos(el));
  vec3 rr = rgt * cos(ro2) + up * sin(ro2);
  vec3 uu = up * cos(ro2) - rgt * sin(ro2);
  vec3 tgt = vec3(uTgt.xy, 0.0);
  vec3 ro = tgt + back * uCam.z;
  vec3 rd = normalize(tgt + (fc.x * rr + fc.y * uu) / uCam.w - ro);

  float tG = -ro.z / min(rd.z, -1e-4);
  float M = 0.8;
  vec3 bmin = vec3(-1.0 - M, -L - M, 0.0);
  vec3 bmax = vec3(1.0 + M, L + M, L * sin(TH) * 1.1 + M);
  vec3 inv = 1.0 / (abs(rd) + 1e-6) * sign(rd + 1e-9);
  vec3 t0 = (bmin - ro) * inv;
  vec3 t1 = (bmax - ro) * inv;
  vec3 ta = min(t0, t1);
  vec3 tb = max(t0, t1);
  float tN = max(max(ta.x, ta.y), max(ta.z, 0.0));
  float tF = min(min(tb.x, tb.y), min(tb.z, tG));

  gView = -rd;
  gTop = 0.0;
  float t = tN;
  bool hit = false;
  vec3 pL = ro;
  float dLamp = 1e3;
  float dBody = 1e3;
  float tBody = tN;
  if (tN < tF) {
    for (int i = 0; i < 72; i++) {
      vec3 p = ro + rd * t;
      float d = body(p);
      float dl = lamp(p);
      if (dl < dLamp) { dLamp = dl; pL = p; }
      if (d < dBody) { dBody = d; tBody = t; }
      if (d < 0.0006) { hit = true; break; }
      t += max(d, pw * 0.35);
      if (t > tF) break;
    }
  }

  vec3 pg = ro + rd * tG;
  vec3 ph = ro + rd * t;
  vec3 col;
  if (hit && ph.z > 0.003) {
    col = shadeBody(ph);
  } else {
    vec3 pq = hv(pg.y);
    bool under = sd2(pg.xy) < 0.0 && min(abs(pg.y), L) * pq.x > TP + 0.004;
    if (under) {
      // a grazing ray that slipped past the foot of the wall
      col = shadeBody(vec3(pg.xy, 0.002));
    } else {
      col = shadeGround(pg.xy);
      vec3 pb = ro + rd * tBody;
      float cov = clamp(1.0 - dBody / pw, 0.0, 1.0) * step(0.003, pb.z);
      if (cov > 0.0) col = mix(col, shadeBody(pb), cov);
    }
    if (!under) gTop = step(sd2(pg.xy), 0.0);
    float dl = lamp(vec3(pg.xy, 0.0));
    if (dl < dLamp) { dLamp = dl; pL = vec3(pg.xy, 0.0); }
  }

  // bloom: a tight one everywhere, a wide lens glare where the bare wall faces the lens, stronger up close
  float faces = max(dot(grad2(pL.xy), gView.xy), 0.0);
  float near = clamp((uCam.w - 120.0) / 180.0, 0.0, 1.0);
  // a slit of light throws no glare: it grows with the height of the wall nearest the ray
  vec3 kL = hv(pL.y);
  float tallL = smoothstep(0.0, 0.12, min(abs(pL.y) + pL.z * kL.z, L) * kL.x - TP);
  float wide = (0.04 * exp(-dLamp * 6.0) + (0.2 + 0.2 * near) * faces * faces * exp(-dLamp * 1.5)) * (1.0 - 0.97 * gTop) * tallL;
  float tight = 0.5 * (1.0 - 0.6 * near) * exp(-dLamp * mix(45.0, 150.0, gTop));
  col += pow(gGlow, vec3(1.25)) * uBloom * (tight + wide);

  // the close shot is exposed a little brighter in the light scene
  col *= mix(uTgt.w, 1.0, uDark);
  // soft shoulder so the lamp burns out to white while mid tones stay exact
  vec3 over = max(col - 0.8, 0.0);
  col = min(col, 0.8) + 0.2 * (1.0 - exp(-over / 0.2));
  col = pow(max(col, 0.0), vec3(1.0 / 2.2));
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  col += (n - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
`
export function GlowRocker({
  checked,
  defaultChecked = false,
  onChange,
  view = 'iso',
  autoplay = false,
  glowColor = '#a64dff',
  lightColor = '#c1c1c1',
  darkColor = '#151515',
  labelColor = '#ffffff',
  onLabel = 'ON',
  offLabel = 'OFF',
  topLabel = 'ER',
  bottomLabel = 'SU',
  font = '"Barlow Condensed", "Barlow", ui-sans-serif, system-ui, sans-serif',
  dots = 19,
  dotsFromTop = false,
  duration = 720,
  orbit = 4,
  ariaLabel = 'Glow rocker',
  className,
  style,
}) {
  const rootRef = React.useRef(null)
  const canvasRef = React.useRef(null)
  const engineRef = React.useRef(null)
  const [inner, setInner] = React.useState(defaultChecked)
  const [mode, setMode] = React.useState('gl')
  const [epoch, setEpoch] = React.useState(0)
  const on = checked === undefined ? inner : checked
  const live = React.useRef(null)
  const labelKey = [offLabel, onLabel, topLabel, bottomLabel, font].join('\u0001')
  const prevLabelKey = React.useRef(labelKey)
  live.current = {
    view,
    autoplay,
    glowColor,
    lightColor,
    darkColor,
    labelColor,
    labels: [offLabel, onLabel, topLabel, bottomLabel],
    font,
    dots: Math.max(2, Math.min(60, Math.round(dots))),
    dotsFromTop,
    duration: Math.max(60, duration),
    orbit,
  }
  const onRef = React.useRef(on)
  onRef.current = on
  React.useEffect(() => {
    const root = rootRef.current
    const canvas = canvasRef.current
    if (!root || !canvas) return
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    /* ---------- renderer ---------- */
    let gl = null
    let ctx = null
    let prog = null
    let tex = null
    let buf = null
    const U = {}
    if (mode === 'gl') {
      try {
        gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance' })
      } catch {
        gl = null
      }
      if (gl) {
        const make = (type, src) => {
          const s = gl.createShader(type)
          gl.shaderSource(s, src)
          gl.compileShader(s)
          return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null
        }
        const vs = make(gl.VERTEX_SHADER, VERT)
        const fs = make(gl.FRAGMENT_SHADER, FRAG)
        prog = gl.createProgram()
        if (vs && fs && prog) {
          gl.attachShader(prog, vs)
          gl.attachShader(prog, fs)
          gl.linkProgram(prog)
        }
        if (!vs || !fs || !prog || !gl.getProgramParameter(prog, gl.LINK_STATUS)) {
          // the context is taken, so a fresh canvas has to carry the 2D fallback
          setMode('2d')
          return
        }
        gl.useProgram(prog)
        buf = gl.createBuffer()
        gl.bindBuffer(gl.ARRAY_BUFFER, buf)
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
        const loc = gl.getAttribLocation(prog, 'aPos')
        gl.enableVertexAttribArray(loc)
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
        for (const n of [
          'uRes',
          'uScale',
          'uCam',
          'uTgt',
          'uDim',
          'uPose',
          'uDark',
          'uBloom',
          'uLit',
          'uDots',
          'uDotsRev',
          'uGlow',
          'uLight',
          'uShade',
          'uInk',
          'uText',
        ]) {
          U[n] = gl.getUniformLocation(prog, n)
        }
        tex = gl.createTexture()
      }
    }
    if (!gl) ctx = canvas.getContext('2d')
    if (!gl && !ctx) return
    /* ---------- colours and text ---------- */
    let cGlow = [0.65, 0.3, 1]
    let cLight = [0.757, 0.757, 0.757]
    let cDark = [0.075, 0.075, 0.075]
    let cInk = [1, 1, 1]
    const readColors = () => {
      const p = live.current
      cGlow = parseColor(p.glowColor, [0.65, 0.3, 1])
      cLight = parseColor(p.lightColor, [0.757, 0.757, 0.757])
      cDark = parseColor(p.darkColor, [0.075, 0.075, 0.075])
      cInk = parseColor(p.labelColor, [1, 1, 1])
    }
    const readText = () => {
      const p = live.current
      if (gl && tex) {
        const atlas = drawAtlas(p.labels, p.font)
        gl.bindTexture(gl.TEXTURE_2D, tex)
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas)
        gl.generateMipmap(gl.TEXTURE_2D)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      }
    }
    readColors()
    readText()
    /* ---------- state ---------- */
    let W = 1
    let H = 1
    let dpr = 1
    let raf = 0
    let alive = true
    let seen = true
    let clock = 0 // runs only while the scene is on screen
    let last = -1
    let auto = live.current.autoplay && !reduce
    let autoT0 = 0
    let target = onRef.current
    let pose = target ? 1 : 0
    let dark = target ? 1 : 0
    let bloom = dark
    let lit = target ? live.current.dots : 0
    // a rock in progress: `to` is where it lands, `u0` where on the curve it started
    let rock = null
    // the snap home after the flip, or a quiet return when a rock is called off
    let settle = null
    let cam = { ...VIEWS[live.current.view] }
    let camFrom = cam
    let camTo = live.current.view
    let camT0 = -1e9
    const CAM_MS = 900
    let ox = 0
    let oy = 0
    let oxT = 0
    let oyT = 0
    const shown = () => dark >= 0.5
    const aim = (to) => {
      target = to
      const dur = live.current.duration
      if (reduce) {
        rock = null
        settle = null
        pose = to ? 1 : 0
        dark = bloom = to ? 1 : 0
        lit = to ? live.current.dots : 0
        kick()
        return
      }
      if (shown() === to && !(rock && rock.to === to)) {
        // the scene already shows this state: let the plate fall back
        if (rock || Math.abs(pose - (to ? 1 : 0)) > 1e-3) {
          rock = null
          settle = { to, t0: clock, from: pose, lit0: lit, flip: false }
        }
      } else if (!rock || rock.to !== to) {
        settle = null
        const u0 = to ? unrockOn(pose) : unrockOff(1 - pose)
        rock = { to, t0: clock, u0: Math.min(u0, 0.92), dur }
      }
      kick()
    }
    /** the film, as a pure function of time */
    const film = (ms) => {
      const f = ((ms / 1000) * FPS) % LOOP_FRAMES
      let cut = CUTS[0]
      for (const c of CUTS) if (f >= c[0]) cut = c
      const j = f - cut[0] + cut[4]
      const n = live.current.dots
      if (cut[2]) {
        const u = Math.min(j / OFF_FRAMES, 0.9999)
        return { pose: 1 - rockOff(u), dark: 1, lit: litOff(u, n), view: cut[3] }
      }
      const u = Math.min(j / ON_FRAMES, 0.9999)
      return { pose: rockOn(u), dark: 0, lit: litOn(u, n), view: cut[3] }
    }
    /** advance everything to `clock`; returns true while something is still moving */
    const step = (dt) => {
      const p = live.current
      let moving = false
      if (auto) {
        const s = film(clock - autoT0)
        pose = s.pose
        dark = bloom = s.dark
        lit = s.lit
        cam = { ...VIEWS[s.view] }
        camTo = s.view
        camT0 = -1e9
        moving = true
      } else {
        if (rock) {
          const u = rock.u0 + (clock - rock.t0) / rock.dur
          if (u >= 1) {
            settle = {
              to: rock.to,
              t0: rock.t0 + (1 - rock.u0) * rock.dur,
              from: rock.to ? rockOn(0.9999) : 1 - rockOff(0.9999),
              lit0: lit,
              flip: true,
            }
            rock = null
          } else {
            pose = rock.to ? rockOn(u) : 1 - rockOff(u)
            lit = rock.to ? litOn(u, p.dots) : litOff(u, p.dots)
          }
          moving = true
        }
        if (settle) {
          const e = clock - settle.t0
          const home = settle.to ? 1 : 0
          const sign = settle.to ? 1 : -1
          if (settle.flip) {
            // snap, a small overshoot, then rest; the scene and the glow come up behind it
            pose = home + (settle.from - home) * Math.exp(-e / 24) + sign * 0.03 * Math.exp(-e / 95) * Math.sin(e / 34)
            const k = clamp01(e / 130)
            const fade = k * k * (3 - 2 * k)
            dark = settle.to ? fade : 1 - fade
            bloom = settle.to
              ? fade * (1 + 0.45 * Math.exp(-e / 190) * Math.sin(Math.min(e / 120, 1) * Math.PI))
              : 1 - fade
            lit = settle.to ? p.dots : 0
            if (e > 620) {
              pose = home
              dark = bloom = home
              settle = null
            }
          } else {
            const k = 1 - Math.exp(-e / 70)
            pose = mix(settle.from, home, k)
            lit = Math.round(mix(settle.lit0, settle.to ? p.dots : 0, k))
            if (e > 420) {
              pose = home
              lit = settle.to ? p.dots : 0
              settle = null
            }
          }
          moving = true
        }
        if (!rock && !settle) lit = shown() ? p.dots : 0
        // camera glide between presets
        if (p.view !== camTo) {
          camFrom = cam
          camTo = p.view
          camT0 = reduce ? -1e9 : clock
        }
        const ck = clamp01((clock - camT0) / CAM_MS)
        cam = ck >= 1 ? { ...VIEWS[camTo] } : mixCam(camFrom, VIEWS[camTo], ease(ck))
        if (ck < 1) moving = true
      }
      // pointer orbit, eased
      const a = reduce ? 1 : 1 - Math.exp(-dt / 140)
      ox += (oxT - ox) * a
      oy += (oyT - oy) * a
      if (Math.abs(oxT - ox) + Math.abs(oyT - oy) > 0.002) moving = true
      else {
        ox = oxT
        oy = oyT
      }
      return moving
    }
    const draw = () => {
      const p = live.current
      const scale = Math.min(W / 720, H / cam.need)
      const c = { ...cam, az: cam.az + ox * p.orbit, el: cam.el - oy * p.orbit * 0.7 }
      if (gl && prog) {
        gl.viewport(0, 0, canvas.width, canvas.height)
        gl.uniform2f(U.uRes, canvas.width, canvas.height)
        gl.uniform1f(U.uScale, scale * dpr)
        gl.uniform4f(U.uCam, c.az, c.el, c.dist, c.zoom)
        gl.uniform4f(U.uTgt, c.tx, c.ty, c.roll, c.gain)
        gl.uniform1f(U.uDim, c.dim)
        gl.uniform1f(U.uPose, pose)
        gl.uniform1f(U.uDark, dark)
        gl.uniform1f(U.uBloom, bloom)
        gl.uniform1f(U.uLit, lit)
        gl.uniform1f(U.uDots, p.dots)
        gl.uniform1f(U.uDotsRev, p.dotsFromTop ? 1 : 0)
        gl.uniform3f(U.uGlow, cGlow[0], cGlow[1], cGlow[2])
        gl.uniform3f(U.uLight, cLight[0], cLight[1], cLight[2])
        gl.uniform3f(U.uShade, cDark[0], cDark[1], cDark[2])
        gl.uniform3f(U.uInk, cInk[0], cInk[1], cInk[2])
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, tex)
        gl.uniform1i(U.uText, 0)
        gl.drawArrays(gl.TRIANGLES, 0, 3)
      } else if (ctx) {
        paint2d(
          ctx,
          canvas.width,
          canvas.height,
          scale * dpr,
          c,
          pose,
          dark,
          bloom,
          lit,
          p.dots,
          p.labels,
          p.font,
          cGlow,
          cLight,
          cDark,
          cInk,
          p.dotsFromTop,
        )
      }
    }
    const tick = (now) => {
      raf = 0
      if (!alive) return
      const dt = last < 0 ? 0 : Math.min(now - last, 100000)
      last = now
      clock += dt
      const moving = step(dt)
      draw()
      if (moving && seen && !document.hidden) raf = requestAnimationFrame(tick)
      else last = -1
    }
    const kick = () => {
      if (!raf && alive && seen && !document.hidden) raf = requestAnimationFrame(tick)
    }
    const resize = () => {
      const r = root.getBoundingClientRect()
      W = Math.max(1, r.width)
      H = Math.max(1, r.height)
      dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2)
      const w = Math.round(W * dpr)
      const h = Math.round(H * dpr)
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      kick()
    }
    let autoWas = live.current.autoplay && !reduce
    engineRef.current = {
      aim,
      shown,
      takeOver() {
        if (!auto) return
        auto = false
        const s = film(clock - autoT0)
        pose = s.pose
        dark = bloom = s.dark
        lit = s.lit
        target = s.dark >= 0.5
        // hold the film's camera, then glide to the chosen view
        cam = { ...VIEWS[s.view] }
        camTo = s.view
      },
      refresh(textChanged) {
        readColors()
        if (textChanged) readText()
        const wantAuto = live.current.autoplay && !reduce
        if (wantAuto && !auto && !rock && !settle && wantAuto !== autoWas) {
          auto = true
          autoT0 = clock
        }
        if (!wantAuto && auto) this.takeOver()
        autoWas = wantAuto
        kick()
      },
      orbitTo(x, y) {
        oxT = x
        oyT = y
        kick()
      },
    }
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null
    ro?.observe(root)
    const io =
      typeof IntersectionObserver === 'function'
        ? new IntersectionObserver((es) => {
            seen = es[es.length - 1].isIntersecting
            if (seen) kick()
          })
        : null
    io?.observe(root)
    const onVis = () => {
      if (!document.hidden) kick()
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('resize', resize)
    const onLost = (e) => e.preventDefault()
    const onBack = () => setEpoch((n) => n + 1)
    canvas.addEventListener('webglcontextlost', onLost)
    canvas.addEventListener('webglcontextrestored', onBack)
    let fontsLive = true
    const fonts = document.fonts
    fonts?.ready.then(() => {
      if (fontsLive && alive) {
        readText()
        kick()
      }
    })
    resize()
    return () => {
      alive = false
      fontsLive = false
      if (raf) cancelAnimationFrame(raf)
      ro?.disconnect()
      io?.disconnect()
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('webglcontextlost', onLost)
      canvas.removeEventListener('webglcontextrestored', onBack)
      if (gl) {
        if (tex) gl.deleteTexture(tex)
        if (buf) gl.deleteBuffer(buf)
        if (prog) gl.deleteProgram(prog)
      }
      engineRef.current = null
    }
  }, [mode, epoch])
  // props to the running scene
  React.useEffect(() => {
    const changed = prevLabelKey.current !== labelKey
    prevLabelKey.current = labelKey
    engineRef.current?.refresh(changed)
  })
  React.useEffect(() => {
    const e = engineRef.current
    if (!e) return
    if (live.current.autoplay) return
    e.aim(on)
  }, [on])
  const toggle = () => {
    const e = engineRef.current
    let next = !on
    if (e && live.current.autoplay) {
      // the first press takes over from the film, starting from what is on screen
      next = !e.shown()
      e.takeOver()
    }
    if (checked === undefined) setInner(next)
    onChange?.(next)
    e?.aim(next)
  }
  const onKeyDown = (ev) => {
    if (ev.key === ' ' || ev.key === 'Enter') {
      ev.preventDefault()
      toggle()
    }
  }
  const onPointerMove = (ev) => {
    if (ev.pointerType === 'touch') return
    const r = ev.currentTarget.getBoundingClientRect()
    engineRef.current?.orbitTo(((ev.clientX - r.left) / r.width) * 2 - 1, ((ev.clientY - r.top) / r.height) * 2 - 1)
  }
  const onPointerLeave = () => engineRef.current?.orbitTo(0, 0)
  return (
    <div
      ref={rootRef}
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      tabIndex={0}
      className={className}
      onClick={toggle}
      onKeyDown={onKeyDown}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 240,
        overflow: 'hidden',
        cursor: 'pointer',
        userSelect: 'none',
        WebkitTapHighlightColor: 'transparent',
        touchAction: 'manipulation',
        background: on ? darkColor : lightColor,
        ...style,
      }}
    >
      <canvas
        key={mode + epoch}
        ref={canvasRef}
        aria-hidden="true"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
      />
    </div>
  )
}
const SUN_2D = [-0.711, -0.556, 0.431] // the same sun as the shader
const lin3 = (c) => [Math.pow(c[0], 2.2), Math.pow(c[1], 2.2), Math.pow(c[2], 2.2)]
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)]
const mul3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k]
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const step01 = (a, b, v) => {
  const t = clamp01((v - a) / (b - a))
  return t * t * (3 - 2 * t)
}
/** Linear rgb to a CSS colour. */
function css(c, alpha = 1) {
  const g = (v) => Math.round(255 * Math.pow(clamp01(v), 1 / 2.2))
  return `rgba(${g(c[0])}, ${g(c[1])}, ${g(c[2])}, ${clamp01(alpha).toFixed(3)})`
}
/**
 * The same scene without WebGL: the rocker is built from projected polygons
 * (leaning wall quads, two tilting plates), canvas blur stands in for the soft
 * shadow and the halo, and the labels are drawn as text in perspective.
 */
function paint2d(x, w, h, scale, cam, pose, dark, bloom, lit, dots, labels, font, glow, light, shade, ink, dotsFromTop) {
  const gGlow = lin3(glow)
  const gInk = lin3(ink)
  const gLight = mul3(lin3(light), mix(cam.gain, 1, dark))
  const gShade = mul3(lin3(shade), cam.dim)
  const px = cam.zoom * scale
  const amb = 0.06
  // camera: the picture plane passes through the target
  const rad = Math.PI / 180
  const az = cam.az * rad
  const el = cam.el * rad
  const ro = cam.roll * rad
  const fx = -Math.sin(az)
  const fy = Math.cos(az)
  const bk = [-fx * Math.cos(el), -fy * Math.cos(el), Math.sin(el)]
  const r0 = [Math.cos(az), Math.sin(az), 0]
  const u0 = [fx * Math.sin(el), fy * Math.sin(el), Math.cos(el)]
  const rr = [0, 1, 2].map((i) => r0[i] * Math.cos(ro) + u0[i] * Math.sin(ro))
  const uu = [0, 1, 2].map((i) => u0[i] * Math.cos(ro) - r0[i] * Math.sin(ro))
  const proj = (X, Y, Z) => {
    const dx = X - cam.tx
    const dy = Y - cam.ty
    const k = (cam.dist / Math.max(cam.dist - (dx * bk[0] + dy * bk[1] + Z * bk[2]), 0.01)) * px
    return [w / 2 + (dx * rr[0] + dy * rr[1] + Z * rr[2]) * k, h / 2 - (dx * uu[0] + dy * uu[1] + Z * uu[2]) * k]
  }
  const path = (pts, shift = 0) => {
    x.moveTo(pts[0][0] + shift, pts[0][1])
    for (let i = 1; i < pts.length; i++) x.lineTo(pts[i][0] + shift, pts[i][1])
    x.closePath()
  }
  // floor
  x.setTransform(1, 0, 0, 1, 0, 0)
  x.globalCompositeOperation = 'source-over'
  x.globalAlpha = 1
  x.shadowColor = 'transparent'
  x.shadowBlur = 0
  x.fillStyle = css(mix3(gLight, gShade, dark))
  x.fillRect(0, 0, w, h)
  // one half of the pill outline, from the hinge round the tip and back: [x, y]
  const N = 28
  const out = [[1, 0]]
  for (let i = 0; i <= N; i++) {
    const f = (Math.PI * i) / N
    out.push([Math.cos(f), HALF + Math.sin(f)])
  }
  out.push([-1, 0])
  const halves = [1, -1].map((sg) => {
    const a = Math.min(Math.max(sg > 0 ? pose : 1 - pose, 0), 1.08) * TILT
    const ca = Math.cos(a)
    const sa = Math.sin(a)
    const foot = out.map(([X, Y]) => proj(X, sg * Y, 0))
    const top = out.map(([X, Y]) => proj(X, sg * Y * ca, Y * sa))
    return { sg, a, ca, sa, foot, top, open: clamp01(a / TILT), ajar: clamp01(a / 0.02) }
  })
  // light scene: the lifted half throws a soft shadow away from the sun
  const far = Math.max(w, h) * 3
  if (dark < 0.999) {
    x.beginPath()
    let any = false
    for (const hf of halves) {
      if (hf.a < 0.004) continue
      any = true
      for (let s = 0; s <= 4; s++) {
        const t = s / 4
        const pts = out.map(([X, Y]) => {
          const z = Y * hf.sa * t
          return proj(X + 0.95 * z, hf.sg * Y * mix(1, hf.ca, t) + 0.5 * z, 0)
        })
        path(pts, -far)
      }
    }
    if (any) {
      x.shadowOffsetX = far
      x.shadowBlur = 0.3 * px
      x.shadowColor = css(mul3(gLight, 0.07), 0.8 * (1 - dark))
      x.fillStyle = '#000000' // ls:keep
      x.fill()
      x.shadowBlur = 0.8 * px
      x.shadowColor = css(mul3(gLight, 0.07), 0.4 * (1 - dark))
      x.fill()
    }
  }
  // dark scene: the open half pours light on the floor
  if (dark * bloom > 0.004) {
    const deepCol = [Math.pow(gGlow[0], 1.25), Math.pow(gGlow[1], 1.25), Math.pow(gGlow[2], 1.25)]
    const hotCol = [1.0, 0.5, 0.6]
    for (const hf of halves) {
      if (hf.ajar <= 0) continue
      const k = dark * bloom * Math.max(hf.open, 0.15 * hf.ajar)
      x.beginPath()
      path(hf.foot, -far)
      x.shadowOffsetX = far
      x.fillStyle = '#000000' // ls:keep
      x.shadowBlur = (0.3 + 0.9 * hf.open) * px
      x.shadowColor = css(deepCol, 0.85 * k)
      x.fill()
      x.shadowBlur = (0.15 + 0.3 * hf.open) * px
      x.shadowColor = css(mix3(deepCol, gGlow, 0.5), 0.95 * k)
      x.fill()
      x.fill()
      x.shadowBlur = 0.08 * px
      x.shadowColor = css(mix3(gGlow, hotCol, 0.6), 0.9 * k)
      x.fill()
    }
  }
  x.shadowOffsetX = 0
  x.shadowBlur = 0
  x.shadowColor = 'transparent'
  // text laid on a plane through (cx, cy, cz) with the given up vector
  const write = (text, c, up, cap, heavy, col, maxW) => {
    if (!text) return
    const p0 = proj(c[0], c[1], c[2])
    const pu = proj(c[0] + 0.1, c[1], c[2])
    const pv = proj(c[0] + up[0] * 0.1, c[1] + up[1] * 0.1, c[2] + up[2] * 0.1)
    x.font = `${heavy ? 600 : 400} 100px ${font}`
    const capPx = x.measureText('H').actualBoundingBoxAscent || 71
    const m = (cap / capPx) * 10
    x.setTransform((pu[0] - p0[0]) * m, (pu[1] - p0[1]) * m, -(pv[0] - p0[0]) * m, -(pv[1] - p0[1]) * m, p0[0], p0[1])
    x.textAlign = 'center'
    x.textBaseline = 'alphabetic'
    x.fillStyle = col
    x.fillText(text, 0, capPx / 2, (maxW * capPx) / cap)
    x.setTransform(1, 0, 0, 1, 0, 0)
  }
  // dotted line and side labels on the floor
  const sp = (DOT_Y1 - DOT_Y0) / Math.max(dots - 1, 1)
  const pitLightCol = mul3(mix3(gLight, lin3([0.56, 0.58, 0.72]), 0.5), 0.8)
  const pitDarkCol = add3(gShade, mul3(gGlow, 0.14))
  const offCol = mix3(pitLightCol, pitDarkCol, dark)
  const onCol = mul3(gInk, 0.87)
  for (let i = 0; i < dots; i++) {
    const cy = DOT_Y0 + i * sp
    const p0 = proj(DOT_X, cy, 0)
    const pu = proj(DOT_X + 0.1, cy, 0)
    const pv = proj(DOT_X, cy + 0.1, 0)
    const on = (dotsFromTop ? dots - 1 - i : i) + 0.5 < lit
    x.setTransform((pu[0] - p0[0]) * 10, (pu[1] - p0[1]) * 10, (pv[0] - p0[0]) * 10, (pv[1] - p0[1]) * 10, p0[0], p0[1])
    x.beginPath()
    x.arc(0, 0, DOT_R, 0, Math.PI * 2)
    if (on) {
      x.shadowBlur = 0.12 * px
      x.shadowColor = css(gInk, 0.55 - 0.25 * dark)
    }
    x.fillStyle = css(on ? onCol : offCol)
    x.fill()
    x.shadowBlur = 0
    x.shadowColor = 'transparent'
  }
  x.setTransform(1, 0, 0, 1, 0, 0)
  const sideInkCol = css(mix3(lin3([0.47, 0.47, 0.47]), gInk, dark))
  write(labels[2], [SIDE_X, TOP_Y, 0], [0, 1, 0], CAP_SIDE, dark >= 0.5, sideInkCol, 2.1)
  write(labels[3], [SIDE_X, BOT_Y, 0], [0, 1, 0], CAP_SIDE, dark >= 0.5, sideInkCol, 2.1)
  // walls: violet body in the light scene, a lamp in the dark scene
  const quads = []
  for (const hf of halves) {
    if (hf.a < 0.004) continue
    for (let i = 0; i < out.length - 1; i++) {
      const mx = (out[i][0] + out[i + 1][0]) / 2
      const my = (out[i][1] + out[i + 1][1]) / 2
      let nx = mx
      let ny = Math.max(my - HALF, 0)
      if (i === 0) ((nx = 1), (ny = 0))
      if (i === out.length - 2) ((nx = -1), (ny = 0))
      const nl = Math.hypot(nx, ny) || 1
      const lam2 = (nx / nl) * -0.788 + ((hf.sg * ny) / nl) * -0.616
      const lt = clamp01((lam2 - 0.1) / 0.9)
      const base = mix(0.14, 0.63, step01(-0.95, 0.2, lam2)) - 0.27 * step01(0.5, 1, lam2)
      const warm = 0.11 * step01(-0.3, 0.3, lam2) * (1 - step01(0.7, 1, lam2))
      const sunlitCol = [0.8, 0.5, 0.62]
      const warmCol = [1.0, 0.0, 0.0]
      const wallLightCol = add3(add3(mul3(gGlow, base), mul3(sunlitCol, 0.8 * lt * Math.sqrt(lt))), mul3(warmCol, warm))
      const away = 1 - step01(-0.7, -0.2, lam2)
      const lampCol = [1.0, 0.82, 0.9]
      const wallDarkCol = mix3(mul3(gGlow, 1.6), lampCol, 0.25 + 0.75 * bloom)
      const depth = mx * bk[0] + hf.sg * my * bk[1]
      quads.push({
        z: depth,
        a: hf.foot[i],
        b: hf.foot[i + 1],
        c: hf.top[i + 1],
        d: hf.top[i],
        lo: css(mix3(mul3(wallLightCol, mix(1, 0.12, away)), wallDarkCol, dark)),
        hi: css(mix3(mul3(wallLightCol, mix(1, 1.25, away)), wallDarkCol, dark)),
      })
    }
  }
  quads.sort((p, q) => p.z - q.z)
  x.lineWidth = 1
  x.lineJoin = 'round'
  for (const q of quads) {
    const g = x.createLinearGradient(
      (q.a[0] + q.b[0]) / 2,
      (q.a[1] + q.b[1]) / 2,
      (q.c[0] + q.d[0]) / 2,
      (q.c[1] + q.d[1]) / 2,
    )
    g.addColorStop(0, q.lo)
    g.addColorStop(0.9, q.hi)
    x.beginPath()
    path([q.a, q.b, q.c, q.d])
    x.fillStyle = g
    x.strokeStyle = g
    x.fill()
    x.stroke()
  }
  // plates, their edges and their labels
  const inkLightCol = lin3([0.31, 0.31, 0.31])
  const inkDarkCol = lin3([0.65, 0.65, 0.65])
  for (const hf of halves) {
    const lam = Math.max(-hf.sg * hf.sa * SUN_2D[1] + hf.ca * SUN_2D[2], 0) / SUN_2D[2]
    const topLam = Math.min(lam, 1) + Math.max(lam - 1, 0) * 0.47
    const topLightCol = mul3(gLight, amb + (1 - amb) * topLam)
    const topDarkCol = mul3(gShade, Math.min(Math.max(1 + 4.8 * hf.sg * hf.sa, 0.3), 3))
    x.beginPath()
    path(hf.top)
    x.fillStyle = css(mix3(topLightCol, topDarkCol, dark))
    x.fill()
    // edge: a grey lip by day, a lit rim by night; a fine seam where the half lies flush
    const rimLightCol = mul3(gLight, 1.12)
    const rimDarkCol = add3(add3(gShade, mul3(gGlow, 0.3 + 1.3 * hf.ajar)), mul3([0.6, 0.4, 0.55], hf.ajar))
    const seamLightCol = mul3(gLight, 0.55)
    const seamDarkCol = add3(gShade, mul3(gGlow, 0.34))
    const edgeCol = mix3(mix3(seamLightCol, rimLightCol, hf.ajar), mix3(seamDarkCol, rimDarkCol, hf.ajar), dark)
    x.beginPath()
    for (let i = 0; i < hf.top.length; i++) {
      if (i) x.lineTo(hf.top[i][0], hf.top[i][1])
      else x.moveTo(hf.top[i][0], hf.top[i][1])
    }
    x.lineWidth = Math.max(1, mix(0.012, 0.02, hf.ajar) * px)
    x.strokeStyle = css(edgeCol, mix(0.6, 1, hf.ajar))
    if (dark * bloom * hf.ajar > 0.01) {
      x.shadowBlur = 0.16 * px
      x.shadowColor = css(gGlow, dark * bloom * hf.ajar)
    }
    x.stroke()
    x.shadowBlur = 0
    x.shadowColor = 'transparent'
    const off = hf.sg > 0
    const y0 = off ? OFF_Y : -ON_Y
    const brightCol = off ? mix3(gInk, inkDarkCol, dark) : mix3(inkLightCol, gInk, dark)
    write(
      labels[off ? 0 : 1],
      [0, hf.sg * y0 * hf.ca, y0 * hf.sa],
      [0, hf.ca, hf.sg * hf.sa],
      CAP_PLATE,
      off ? dark < 0.5 : dark >= 0.5,
      css(brightCol),
      1.7,
    )
  }
  // bloom over everything
  if (dark * bloom > 0.004) {
    x.globalCompositeOperation = 'lighter'
    for (const hf of halves) {
      if (hf.open < 0.02) continue
      const c = proj(0, hf.sg * LEN * 0.8, 0)
      const g = x.createRadialGradient(c[0], c[1], 0, c[0], c[1], 2.6 * px)
      const bloomCol = [Math.pow(gGlow[0], 1.25), Math.pow(gGlow[1], 1.25), Math.pow(gGlow[2], 1.25)]
      g.addColorStop(0, css(bloomCol, 0.3 * dark * bloom * hf.open))
      g.addColorStop(0.45, css(bloomCol, 0.1 * dark * bloom * hf.open))
      g.addColorStop(1, css(bloomCol, 0))
      x.fillStyle = g
      x.fillRect(0, 0, w, h)
    }
    x.globalCompositeOperation = 'source-over'
  }
}
export default GlowRocker
