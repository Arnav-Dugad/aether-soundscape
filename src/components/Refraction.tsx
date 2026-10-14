import { useMemo } from 'react'

/**
 * A convex-lens displacement map: each pixel's R/G channels encode how far the
 * backdrop is pushed in x/y, strongest at the rim like real glass. Orbs use it via
 * `backdrop-filter: url(#orb-refract)` (Chromium only — other engines keep the frosted look).
 */
function lensMap(size = 128): string {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  const img = g.createImageData(size, size)
  const r = size / 2
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - r) / r
      const dy = (y - r) / r
      const d = Math.min(1, Math.hypot(dx, dy))
      // spherical cap profile: bend grows sharply towards the edge
      const bend = d < 1 ? 1 - Math.sqrt(1 - d * d) : 1
      const i = (y * size + x) * 4
      img.data[i] = 128 - dx * bend * 127
      img.data[i + 1] = 128 - dy * bend * 127
      img.data[i + 2] = 128
      img.data[i + 3] = 255
    }
  }
  g.putImageData(img, 0, 0)
  return c.toDataURL()
}

export function supportsRefraction() {
  const brands = (navigator as Navigator & { userAgentData?: { brands: { brand: string }[] } }).userAgentData?.brands
  return !!brands?.some((b) => /Chromium|Chrome/.test(b.brand))
}

export function RefractionDefs() {
  const href = useMemo(() => (supportsRefraction() ? lensMap() : null), [])
  if (!href) return null
  document.documentElement.classList.add('can-refract')
  return (
    <svg width="0" height="0" className="absolute" aria-hidden>
      <filter id="orb-refract" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
        <feImage href={href} x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map" />
        <feDisplacementMap in="SourceGraphic" in2="map" scale="34" xChannelSelector="R" yChannelSelector="G" result="bent" />
        <feGaussianBlur in="bent" stdDeviation="1.2" />
      </filter>
    </svg>
  )
}
