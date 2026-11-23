import { useEffect, useRef } from 'react'
import { cn } from '../lib/cn'

/*
 * Living hexagon background for the navy brand blocks. Adapted from the "Glyph background" on 21st.dev
 * (animate-ui): instead of letters, each cell holds a tiny hexagon. A faint grid always shows, soft clouds
 * of brighter hexes drift across it, a touch lights the hexes under your finger, and a tap sends a lime
 * ripple out across the grid, like claiming turf. WebGL1, no dependencies; without WebGL it is just the
 * plain block. Children render on top and keep working (taps pass through to buttons as usual).
 */

const VARIANTS = 6 // hex shapes in the atlas (see drawAtlas)
const MAX_WAVES = 12
const TRAIL = 12
const TRAIL_LIFE = 700
const WAVE_LIFE = 4
const WAVE_GAP = 0.3
const WAVE_SPEED = 560
const WAVE_SLOWDOWN = 0.66
const WAVE_EDGE = 14
const WAVE_TAIL = 42
const DRIFT = [-30, 12]
const ACTIVITY_DECAY = 900

const VERTEX = `
attribute vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`

const FRAGMENT = `
precision highp float;
uniform sampler2D atlas;
uniform vec2 size;
uniform vec2 cell;
uniform float dpr;
uniform float count;
uniform float time;
uniform float rest;
uniform float haze;
uniform float hoverInk;
uniform float activity;
uniform vec2 drift;
uniform vec3 color;
uniform vec3 accent;
uniform vec4 waves[${MAX_WAVES * 2}];
uniform vec4 trail[${TRAIL}];

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float smoothNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float outline(float kind, float angle, float phase) {
  if (kind < 0.5) return 1.0;
  if (kind < 1.5) {
    float s = sin(angle);
    float c = cos(angle);
    return (2.0 - 2.0 * s + s * sqrt(abs(c)) / (s + 1.4)) * 0.42;
  }
  return 1.0 + 0.14 * sin(3.0 * angle + phase) + 0.08 * sin(5.0 * angle - phase * 1.3);
}

void main() {
  vec2 pixel = vec2(gl_FragCoord.x, size.y - gl_FragCoord.y);
  // honeycomb: every other row shifts half a cell
  float row = floor(pixel.y / cell.y);
  vec2 shifted = vec2(pixel.x + mod(row, 2.0) * 0.5 * cell.x, pixel.y);
  vec2 index = floor(shifted / cell);
  vec2 point = (index + 0.5) * cell / dpr;

  float ring = 0.0;
  for (int i = 0; i < ${MAX_WAVES}; i++) {
    vec4 a = waves[i * 2];
    vec4 b = waves[i * 2 + 1];
    if (a.w <= 0.0) continue;
    vec2 v = point - a.xy;
    float angle = atan(-v.y, v.x);
    float shape = mix(1.0, outline(b.x, angle, b.z), b.y);
    shape *= 1.0 + 0.07 * sin(3.0 * angle + b.z + b.w) + 0.05 * sin(5.0 * angle - b.z * 1.7 - b.w * 1.3) + 0.03 * sin(9.0 * angle + b.w * 2.1);
    float d = length(v) - a.z * shape;
    float k = d > 0.0 ? d / ${WAVE_EDGE.toFixed(1)} : d / ${WAVE_TAIL.toFixed(1)};
    ring = max(ring, exp(-k * k) * a.w);
  }

  float hover = 0.0;
  for (int i = 0; i < ${TRAIL}; i++) {
    vec4 t = trail[i];
    if (t.w <= 0.0) continue;
    vec2 v = point - t.xy;
    hover += t.w * exp(-dot(v, v) / (2.0 * t.z * t.z));
  }
  hover = min(hover, 1.0);

  mat2 turn = mat2(0.82, 0.57, -0.57, 0.82);
  vec2 q = turn * (point - drift);
  float blob = smoothNoise(vec2(q.x / 140.0, q.y / 80.0) + vec2(time * 0.04, 0.0)) * 0.62
    + smoothNoise(vec2(q.x / 62.0, q.y / 36.0) + vec2(3.7, time * 0.06)) * 0.38;
  float grain = smoothNoise(vec2(q.x / 30.0, q.y / 14.0) + vec2(time * 0.2, 7.3));
  float cloud = blob * (0.82 + 0.24 * grain);
  float mask = pow(smoothstep(0.47 - 0.2 * activity, 0.84, cloud), 2.6);

  float seed = hash(index);
  float epoch = floor(time * 0.08 * (0.4 + seed) + seed * 97.0);
  float glyph = floor(hash(index + epoch * 0.137) * count);
  vec2 local = fract(shifted / cell);
  float a = texture2D(atlas, vec2((glyph + local.x) / count, local.y)).a;
  float ink = pow(a, 1.4);
  float inkGlow = pow(a, 0.7); // the ripple fills the whole hex outline, so the green reads strongly

  float grey = ink * clamp(rest + haze * mask * (1.0 + 0.3 * activity) + hoverInk * hover * (0.6 + 0.4 * mask), 0.0, 1.0);
  float glow = clamp(inkGlow * ring * 1.35, 0.0, 1.0);
  float alpha = grey + glow - grey * glow;
  vec3 tint = color * grey * (1.0 - glow) + accent * glow;
  gl_FragColor = vec4(tint, alpha);
}
`

function compile(gl, type, source) {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null
}

function toRgb(color) {
  const probe = document.createElement('canvas').getContext('2d')
  if (!probe) return [1, 1, 1]
  probe.fillStyle = color
  probe.fillRect(0, 0, 1, 1)
  const [r, g, b] = probe.getImageData(0, 0, 1, 1).data
  return [r / 255, g / 255, b / 255]
}

// Six hexagon "glyphs": big and small outlines, solid hexes and a dot, so the grid has texture.
function drawAtlas(w, h) {
  const atlas = document.createElement('canvas')
  atlas.width = Math.ceil(w * VARIANTS)
  atlas.height = Math.ceil(h)
  const c = atlas.getContext('2d')
  c.strokeStyle = '#fff'
  c.fillStyle = '#fff'
  c.lineJoin = 'round'
  const hex = (cx, cy, r) => {
    c.beginPath()
    for (let k = 0; k < 6; k++) {
      const a = (Math.PI / 3) * k - Math.PI / 2
      const x = cx + r * Math.cos(a)
      const y = cy + r * Math.sin(a)
      if (k === 0) c.moveTo(x, y)
      else c.lineTo(x, y)
    }
    c.closePath()
  }
  const r = Math.min(w, h) * 0.36
  const line = Math.max(1.5, r * 0.13)
  const styles = [
    () => { c.lineWidth = line; c.stroke() },
    () => { c.lineWidth = line * 1.6; c.stroke() },
    () => c.fill(),
    () => { c.lineWidth = line; c.stroke() },
    () => c.fill(),
    () => c.fill(),
  ]
  const sizes = [1, 1, 0.55, 0.62, 0.32, 0.18]
  for (let i = 0; i < VARIANTS; i++) {
    hex((i + 0.5) * w, h / 2, r * sizes[i])
    styles[i]()
  }
  return atlas
}

function createRenderer(gl) {
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX)
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT)
  const program = gl.createProgram()
  if (!vertex || !fragment || !program) return null
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null
  gl.useProgram(program)

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const position = gl.getAttribLocation(program, 'position')
  gl.enableVertexAttribArray(position)
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)

  const texture = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

  const u = {}
  for (const name of ['atlas', 'size', 'cell', 'dpr', 'count', 'time', 'rest', 'haze', 'hoverInk', 'activity', 'drift', 'color', 'accent', 'waves', 'trail'])
    u[name] = gl.getUniformLocation(program, name)
  gl.uniform1i(u.atlas, 0)
  gl.uniform1f(u.count, VARIANTS)

  return {
    atlas(image) {
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
    },
    draw(f) {
      gl.viewport(0, 0, f.width, f.height)
      gl.uniform2f(u.size, f.width, f.height)
      gl.uniform2f(u.cell, ...f.cell)
      gl.uniform1f(u.dpr, f.dpr)
      gl.uniform1f(u.time, f.time)
      gl.uniform1f(u.rest, f.rest)
      gl.uniform1f(u.haze, f.haze)
      gl.uniform1f(u.hoverInk, 0.45)
      gl.uniform1f(u.activity, f.activity)
      gl.uniform2f(u.drift, ...f.drift)
      gl.uniform3f(u.color, ...f.color)
      gl.uniform3f(u.accent, ...f.accent)
      gl.uniform4fv(u.waves, f.waves)
      gl.uniform4fv(u.trail, f.trail)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    },
  }
}

/**
 * <HexGlyphBackground as="section" className="rounded-[28px] bg-brand p-5 text-white">…</HexGlyphBackground>
 * size: hex cell size in px. rest: how bright the grid is at rest. haze: how bright the drifting clouds are.
 */
export default function HexGlyphBackground({
  as: Tag = 'div',
  color = '#ffffff',
  accent = '#bef264',
  size = 22,
  rest = 0.09,
  haze = 0.26,
  className,
  children,
  onPointerDown,
  onPointerMove,
  ...props
}) {
  const containerRef = useRef(null)
  const canvasRef = useRef(null)
  const wavesRef = useRef([]) // { x, y, kind, phase, strength, born (ms of our clock) }
  const trailRef = useRef([])
  const timeRef = useRef(0)
  const activityRef = useRef({ value: 0, at: 0 })
  const kickRef = useRef(() => {})
  const opts = useRef({ color, accent, size, rest, haze })
  opts.current = { color, accent, size, rest, haze }
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return undefined
    const gl = canvas.getContext('webgl', { premultipliedAlpha: true, antialias: false })
    const renderer = gl ? createRenderer(gl) : null
    if (!renderer) return undefined

    let width = 0
    let height = 0
    let dpr = 1
    let cell = [14, 14]
    let colors = null
    let raf = 0
    let last = 0
    let visible = true
    let onScreen = true
    const waves = new Float32Array(MAX_WAVES * 8)
    const trail = new Float32Array(TRAIL * 4)

    const resize = () => {
      const rect = container.getBoundingClientRect()
      width = rect.width
      height = rect.height
      dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2))
      canvas.width = Math.max(1, Math.round(width * dpr))
      canvas.height = Math.max(1, Math.round(height * dpr))
      const s = opts.current.size * dpr
      cell = [Math.round(s), Math.round(s * 0.9)]
      renderer.atlas(drawAtlas(cell[0], cell[1]))
    }

    const draw = (time) => {
      if (!width || !height) return
      const o = opts.current
      const key = `${o.color}|${o.accent}`
      if (!colors || colors.key !== key) colors = { key, color: toRgb(o.color), accent: toRgb(o.accent) }
      waves.fill(0)
      wavesRef.current = wavesRef.current.filter((w) => (time - w.born) / 1000 < WAVE_LIFE + WAVE_GAP)
      wavesRef.current.forEach((w, i) => {
        const age = (time - w.born) / 1000 - w.delay
        if (age <= 0) return
        const radius = (WAVE_SPEED * age) / (1 + WAVE_SLOWDOWN * age)
        const fade = Math.min(1, age / 0.05) * Math.exp(-Math.max(0, age - 0.4) / 1.3) * Math.min(1, Math.max(0, WAVE_LIFE - age) / 0.5)
        waves.set([w.x, w.y, radius, fade * w.strength, w.kind, 0.12 + 0.5 * Math.min(1, age / 2.2), w.phase, age * 3], i * 8)
      })
      trail.fill(0)
      trailRef.current.forEach((p, i) => {
        const age = (time - p.t) / TRAIL_LIFE
        if (age < 0 || age >= 1) return
        trail.set([p.x, p.y, 40 + 25 * age, 0.3 * (1 - age) * (1 - age)], i * 4)
      })
      const e = activityRef.current
      const seconds = time / 1000
      renderer.draw({
        width: canvas.width, height: canvas.height, dpr, cell, time: seconds, rest: o.rest, haze: o.haze,
        activity: e.value * Math.exp(-Math.max(0, time - e.at) / ACTIVITY_DECAY),
        drift: [DRIFT[0] * seconds, DRIFT[1] * seconds], color: colors.color, accent: colors.accent, waves, trail,
      })
    }

    const tick = (now) => {
      raf = 0
      timeRef.current += Math.min(now - last, 64)
      last = now
      draw(timeRef.current)
      if (visible && onScreen && !reduce) raf = requestAnimationFrame(tick)
    }
    const kick = () => {
      if (raf || !visible || !onScreen) return
      last = performance.now()
      raf = requestAnimationFrame(tick)
    }
    kickRef.current = reduce ? () => draw(timeRef.current) : kick

    resize()
    draw(timeRef.current)
    kick()
    const ro = new ResizeObserver(() => {
      resize()
      draw(timeRef.current)
    })
    ro.observe(container)
    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting
      if (onScreen) kick()
    })
    io.observe(container)
    const onVis = () => {
      visible = document.visibilityState === 'visible'
      if (visible) kick()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      if (raf) cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      document.removeEventListener('visibilitychange', onVis)
      kickRef.current = () => {}
    }
  }, [reduce])

  const point = (event) => {
    const rect = containerRef.current.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  return (
    <Tag
      ref={containerRef}
      className={cn('relative isolate overflow-hidden', className)}
      {...props}
      onPointerMove={(event) => {
        onPointerMove?.(event)
        if (reduce) return
        const { x, y } = point(event)
        const now = timeRef.current
        const trail = trailRef.current
        const prev = trail[trail.length - 1]
        const e = activityRef.current
        const current = e.value * Math.exp(-Math.max(0, now - e.at) / ACTIVITY_DECAY)
        activityRef.current = { value: Math.min(1, current + (prev ? Math.hypot(x - prev.x, y - prev.y) : 0) / 600), at: now }
        if (prev && Math.hypot(x - prev.x, y - prev.y) < 18) return
        trailRef.current = [...trail.filter((p) => now - p.t < TRAIL_LIFE).slice(1 - TRAIL), { x, y, t: now }]
        kickRef.current()
      }}
      onPointerDown={(event) => {
        onPointerDown?.(event)
        if (reduce) return
        const { x, y } = point(event)
        const kind = 1 + Math.floor(Math.random() * 2)
        const phase = Math.random() * Math.PI * 2
        const born = timeRef.current
        const added = [[0, 1], [WAVE_GAP, 0.55]].map(([delay, strength]) => ({ x, y, kind, phase, strength, born, delay }))
        wavesRef.current = [...wavesRef.current, ...added].slice(-MAX_WAVES)
        kickRef.current()
      }}
    >
      <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 h-full w-full" />
      <div className="relative z-[1]">{children}</div>
    </Tag>
  )
}
