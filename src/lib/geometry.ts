/** Geometry helpers for drawn paths, lasso selection and wall occlusion. */

export type Pt = [number, number]

/** Chaikin corner-cutting on a closed loop — turns a shaky hand-drawn stroke into a smooth curve. */
function chaikin(pts: Pt[], iterations = 2): Pt[] {
  let out = pts
  for (let k = 0; k < iterations; k++) {
    const next: Pt[] = []
    for (let i = 0; i < out.length; i++) {
      const [ax, ay] = out[i]
      const [bx, by] = out[(i + 1) % out.length]
      next.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25], [ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75])
    }
    out = next
  }
  return out
}

/** Resample a closed loop to `n` points evenly spaced by arc length. */
export function resampleLoop(raw: Pt[], n = 72): Pt[] {
  if (raw.length < 3) return raw
  const pts = chaikin(raw)
  const segs: number[] = []
  let total = 0
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i]
    const [bx, by] = pts[(i + 1) % pts.length]
    const d = Math.hypot(bx - ax, by - ay)
    segs.push(d)
    total += d
  }
  const out: Pt[] = []
  let seg = 0
  let acc = 0
  for (let k = 0; k < n; k++) {
    const target = (k / n) * total
    while (seg < segs.length - 1 && acc + segs[seg] < target) acc += segs[seg++]
    const [ax, ay] = pts[seg]
    const [bx, by] = pts[(seg + 1) % pts.length]
    const f = segs[seg] ? (target - acc) / segs[seg] : 0
    out.push([ax + (bx - ax) * f, ay + (by - ay) * f])
  }
  return out
}

export function loopLength(pts: Pt[]) {
  let total = 0
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i]
    const [bx, by] = pts[(i + 1) % pts.length]
    total += Math.hypot(bx - ax, by - ay)
  }
  return total
}

/** Point at fractional lap `t` along an evenly-resampled loop (Catmull-Rom between samples). */
export function sampleLoop(pts: Pt[], t: number): Pt {
  const n = pts.length
  const f = (((t % 1) + 1) % 1) * n
  const i = Math.floor(f)
  const u = f - i
  const p0 = pts[(i - 1 + n) % n]
  const p1 = pts[i % n]
  const p2 = pts[(i + 1) % n]
  const p3 = pts[(i + 2) % n]
  const cr = (a: number, b: number, c: number, d: number) =>
    0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u)
  return [cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1])]
}

/** Ray-casting point-in-polygon test. */
export function inPolygon(x: number, y: number, poly: Pt[]) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Do segments AB and CD properly intersect? */
export function segmentsIntersect(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number) {
  const d1 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx)
  const d2 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx)
  const d3 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
  const d4 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax)
  return d1 * d2 < 0 && d3 * d4 < 0
}
