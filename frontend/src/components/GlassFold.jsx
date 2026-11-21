// Animated "folded glass" background drawn with WebGL.
// From GradFlow (https://gradflow.meerbahadin.dev), via 21st.dev. Adapted for Turfed:
// plain JS, pauses when off screen or in a background tab, lower resolution on phones to save battery,
// frees its WebGL context on unmount (screens remount on every page change), and a still frame for
// people who ask for reduced motion.
import { useEffect, useRef } from 'react'

const VERTEX = `
  attribute vec2 position;
  varying vec2 vUv;
  void main() {
    vUv = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`

const FRAGMENT = `
  precision highp float;

  uniform float u_time;
  uniform vec3 u_color1;
  uniform vec3 u_color2;
  uniform vec3 u_color3;
  uniform float u_scale;
  uniform float u_noise;
  uniform vec2 u_resolution;
  varying vec2 vUv;

  float grain(vec2 st) {
    return fract(sin(dot(st, vec2(12.9898, 78.233))) * 43758.5453);
  }

  vec2 centered(vec2 uv) {
    vec2 p = uv - 0.5;
    p.x *= u_resolution.x / max(u_resolution.y, 1.0);
    return p;
  }

  mat2 rot(float a) {
    float s = sin(a);
    float c = cos(a);
    return mat2(c, -s, s, c);
  }

  // Panes of glass folded over each other: each has a lit crease that fades out behind it,
  // and the panes screen-blend, so overlaps get brighter.
  vec3 shade(vec2 uv, float time) {
    vec2 q = rot(0.6) * centered(uv) * 2.0 * u_scale;
    float t = time * 0.6;
    float pixel = 2.0 * u_scale / max(u_resolution.y, 1.0);

    vec3 color = mix(u_color2, u_color2 * 0.45, clamp(length(centered(uv)) * 1.3, 0.0, 1.0));

    for (int i = 0; i < 6; i++) {
      float fi = float(i);
      float bend = mod(fi, 2.0) * 2.0 - 1.0;

      float crease = (fi - 2.5) * 0.4
                   + 0.26 * sin(q.x * (1.05 + 0.12 * fi) + fi * 1.9 + t * (0.25 + 0.05 * fi))
                   + 0.1 * bend * q.x * q.x;
      float s = q.y - crease;
      float pane = smoothstep(-pixel, pixel, s);
      float back = max(s, 0.0);

      float body = exp(-back * 1.7);
      float fresnel = exp(-back * 8.0);
      float rim = exp(-back * 80.0);
      float inner = exp(-pow((back - 0.045) / 0.014, 2.0));
      float bloom = exp(-abs(s) * 20.0);

      vec3 tint = mix(u_color1, u_color3, clamp(fresnel * 0.6 + 0.08 + 0.14 * sin(fi * 2.1 + q.x * 0.8 + t * 0.2), 0.0, 1.0));
      vec3 light = tint * pane * (body * 0.42 + fresnel * 0.4)
                 + u_color3 * (pane * (rim * 0.6 + inner * 0.12) + bloom * 0.1);

      color += light * (1.0 - color);
    }

    return clamp(color, 0.0, 1.0);
  }

  void main() {
    vec3 color = shade(vUv, u_time);
    if (u_noise > 0.001) {
      float g = grain(vUv * 200.0 + u_time * 0.1);
      color *= 1.0 - u_noise * 0.4 + u_noise * g * 0.4;
    }
    gl_FragColor = vec4(color, 1.0);
  }
`

function hexToVec3(hex) {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full, 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

function compile(gl, type, source) {
  const shader = gl.createShader(type)
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  return shader
}

/**
 * color1 = the glass panes, color2 = the background, color3 = the lit edges.
 * speed 0 freezes it; scale packs the folds tighter; noise is film grain (0 to 0.5).
 * maxDpr caps the resolution (1.25 is plenty for a soft background and much lighter on a phone).
 * If WebGL isn't available the canvas stays transparent, so give the parent a background colour.
 */
export default function GlassFold({
  color1 = '#1c3f7a',
  color2 = '#0b1d3a',
  color3 = '#bef264',
  speed = 0.5,
  scale = 1,
  noise = 0.12,
  maxDpr = 1.25,
  className = '',
}) {
  const canvasRef = useRef(null)
  // The draw loop reads the latest props from here, so changing one never rebuilds the WebGL program
  const props = useRef({ color1, color2, color3, speed, scale, noise, maxDpr })
  useEffect(() => {
    props.current = { color1, color2, color3, speed, scale, noise, maxDpr }
  })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' })
    if (!gl) return undefined

    const program = gl.createProgram()
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX))
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT))
    gl.linkProgram(program)
    gl.useProgram(program)

    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)
    const position = gl.getAttribLocation(program, 'position')
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)

    const uniform = (name) => gl.getUniformLocation(program, name)
    const u = {
      time: uniform('u_time'),
      color1: uniform('u_color1'),
      color2: uniform('u_color2'),
      color3: uniform('u_color3'),
      scale: uniform('u_scale'),
      noise: uniform('u_noise'),
      resolution: uniform('u_resolution'),
    }

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, props.current.maxDpr)
      const width = Math.max(1, Math.round(canvas.clientWidth * dpr))
      const height = Math.max(1, Math.round(canvas.clientHeight * dpr))
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }
      gl.viewport(0, 0, width, height)
    }

    let elapsed = 0
    let last = null
    let frame = 0
    let visible = true

    const draw = (now) => {
      const p = props.current
      // Add up speed over time, so changing it never makes the pattern jump
      if (last !== null) elapsed += Math.min((now - last) / 1000, 0.1) * p.speed
      last = now
      resize()
      gl.uniform1f(u.time, elapsed)
      gl.uniform3fv(u.color1, hexToVec3(p.color1))
      gl.uniform3fv(u.color2, hexToVec3(p.color2))
      gl.uniform3fv(u.color3, hexToVec3(p.color3))
      gl.uniform1f(u.scale, p.scale)
      gl.uniform1f(u.noise, p.noise)
      gl.uniform2f(u.resolution, canvas.width, canvas.height)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
    }

    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const loop = (now) => {
      draw(now)
      if (!still && visible) frame = requestAnimationFrame(loop)
    }
    const start = () => {
      cancelAnimationFrame(frame)
      last = null // don't jump ahead by the time it was paused
      frame = requestAnimationFrame(loop)
    }
    start()

    // Only animate while it's on screen (it stops by itself in a background tab)
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      if (visible && !still) start()
    })
    io.observe(canvas)

    // With motion off there is no loop, so repaint the still frame on resize
    const ro = new ResizeObserver(() => {
      if (still) draw(performance.now())
    })
    ro.observe(canvas)

    return () => {
      cancelAnimationFrame(frame)
      io.disconnect()
      ro.disconnect()
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
      // Free the context once the canvas has really left the page (browsers allow only a few at once).
      // Not straight away: in development React runs this cleanup and then sets up the same canvas again,
      // and a lost context can't draw anymore.
      const lose = gl.getExtension('WEBGL_lose_context')
      setTimeout(() => {
        if (!canvas.isConnected) lose?.loseContext()
      }, 0)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className}
      style={{ display: 'block', width: '100%', height: '100%' }}
    />
  )
}
