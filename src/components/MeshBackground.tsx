import { useEffect, useRef } from 'react'
import { useStore } from '../store'
import { engine } from '../audio/engine'

const VERT = `
attribute vec2 p;
void main(){ gl_Position = vec4(p, 0.0, 1.0); }
`

// Domain-warped four-point mesh gradient with film grain and a soft vignette.
const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uLevel;
uniform vec3 uBands;
uniform vec3 uC0, uC1, uC2, uC3;

vec3 mod289(vec3 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
vec2 mod289(vec2 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
vec3 permute(vec3 x){ return mod289(((x*34.0)+1.0)*x); }
float snoise(vec2 v){
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m; m = m*m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  float t = uTime * 0.035;

  // domain warp
  vec2 w = vec2(snoise(p * 1.1 + t), snoise(p * 1.1 - t + 4.3));
  // bass swells the warp, mids push the colour wells, highs add shimmer
  vec2 q = p + w * (0.32 + uLevel * 0.15 + uBands.x * 0.35);

  // four drifting colour wells
  vec2 a = vec2(0.25 * aspect + 0.18 * sin(t * 1.3), 0.25 + 0.15 * cos(t * 1.1));
  vec2 b = vec2(0.80 * aspect + 0.15 * cos(t * 0.9), 0.30 + 0.20 * sin(t * 1.7));
  vec2 c = vec2(0.70 * aspect + 0.20 * sin(t * 1.2 + 2.0), 0.85 + 0.10 * cos(t));
  vec2 d = vec2(0.20 * aspect + 0.12 * cos(t * 1.5 + 1.0), 0.80 + 0.12 * sin(t * 0.8));
  a += vec2(uBands.y * 0.08, -uBands.y * 0.05);
  c -= vec2(uBands.y * 0.06, uBands.y * 0.04);
  float wa = 1.0 / pow(distance(q, a) + 0.08, 2.4);
  float wb = 1.0 / pow(distance(q, b) + 0.08, 2.4);
  float wc = 1.0 / pow(distance(q, c) + 0.08, 2.4);
  float wd = 1.0 / pow(distance(q, d) + 0.08, 2.4);
  vec3 col = (uC0 * wa + uC1 * wb + uC2 * wc + uC3 * wd) / (wa + wb + wc + wd);

  // soft luminous caustic band
  float band = smoothstep(0.0, 0.9, snoise(q * 2.2 + t * 2.0) * 0.5 + 0.5);
  col += band * 0.05 * (1.0 + uLevel * 2.0);
  // high-frequency sparkle
  float spark = pow(max(0.0, snoise(q * 9.0 + uTime * 0.6)), 6.0);
  col += spark * uBands.z * 0.35;
  // low-end bloom from the centre
  col *= 1.0 + uBands.x * 0.12 * smoothstep(0.9, 0.0, length(uv - 0.5));

  // vignette + overall darkening so glass reads well
  float vig = smoothstep(1.25, 0.25, length((uv - 0.5) * vec2(aspect, 1.0)));
  col *= mix(0.3, 1.0, vig) * 0.7;

  // film grain
  col += (hash(gl_FragCoord.xy + fract(uTime) * 100.0) - 0.5) * 0.035;
  gl_FragColor = vec4(col, 1.0);
}
`

const hex = (h: string): [number, number, number] => {
  const n = parseInt(h.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

export function MeshBackground() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current!
    const gl = canvas.getContext('webgl', { antialias: false, premultipliedAlpha: false, powerPreference: 'low-power' })
    if (!gl) return
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src)
      gl.compileShader(s)
      return s
    }
    const prog = gl.createProgram()!
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return
    gl.useProgram(prog)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'p')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    const uRes = gl.getUniformLocation(prog, 'uRes')
    const uTime = gl.getUniformLocation(prog, 'uTime')
    const uLevel = gl.getUniformLocation(prog, 'uLevel')
    const uBands = gl.getUniformLocation(prog, 'uBands')
    const bands = [0, 0, 0]
    const uC = [0, 1, 2, 3].map((i) => gl.getUniformLocation(prog, `uC${i}`))

    // render at reduced resolution: the gradient is soft, so this is free quality-wise
    const scale = 0.5
    const resize = () => {
      canvas.width = Math.max(1, Math.floor(innerWidth * scale))
      canvas.height = Math.max(1, Math.floor(innerHeight * scale))
      gl.viewport(0, 0, canvas.width, canvas.height)
    }
    resize()
    addEventListener('resize', resize)

    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    const current = useStore.getState().palette.map(hex)
    let raf = 0
    let last = performance.now()
    let time = Math.random() * 100
    let level = 0
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      if (document.hidden) return
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      time += dt * (reduced ? 0.3 : 1)
      // ease palette towards the active scene's colours
      const target = useStore.getState().palette.map(hex)
      const k = 1 - Math.exp(-dt * 1.4)
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) current[i][j] += (target[i][j] - current[i][j]) * k
      level += ((engine.started ? engine.masterLevel : 0) - level) * 0.05
      gl.uniform2f(uRes, canvas.width, canvas.height)
      gl.uniform1f(uTime, time)
      gl.uniform1f(uLevel, level)
      const src = engine.started ? engine.bands : { low: 0, mid: 0, high: 0 }
      bands[0] += (src.low - bands[0]) * 0.08
      bands[1] += (src.mid - bands[1]) * 0.08
      bands[2] += (src.high - bands[2]) * 0.08
      gl.uniform3f(uBands, bands[0], bands[1], bands[2])
      uC.forEach((u, i) => gl.uniform3fv(u, current[i]))
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      removeEventListener('resize', resize)
    }
  }, [])

  return (
    <>
      <canvas ref={ref} className="fixed inset-0 h-full w-full" aria-hidden />
      <div className="noise-overlay pointer-events-none fixed inset-0" aria-hidden />
    </>
  )
}
