# Aether — Spatial Ambient Soundscape Mixer

A floating, visionOS-inspired audio workspace. Drag glowing, translucent sound orbs closer to or further from the listener at the centre to mix 3D spatial audio in real time.

**Every sound is synthesised live in the browser** with the Web Audio API. There are no audio files. That makes 24 generators that never loop the same way twice.

## Features

- **True 3D audio**: each orb runs through an HRTF `PannerNode` with an inverse distance model, distance-driven air absorption (far sources lose treble) and a distance-driven send into a synthesised stereo hall reverb.
- **Turn your head**: drag the listener node to rotate your heading. The whole field rotates around your ears.
- **Magnetic orbital rings**: release an orb near a ring and it snaps on with spring physics and flick projection. Turn on **Orbit** and ringed orbs circle you, inner rings faster.
- **Audio-reactive visuals**: orbs pulse from per-channel `AnalyserNode`s. They also leave chromatic refraction trails, send wave packets toward the listener, and emit ripples on transients.
- **Living background**: a WebGL domain-warped mesh gradient that morphs to each scene's palette and breathes with the mix.
- **8 curated scenes**: Tokyo Rain, Paris Café, Cabin Storm, Deep Focus, Zen Garden, Night Coast, Abyssal, Night Express.
- **Per-orb controls**: volume, tone (lowpass), reverb send, mute, solo, duplicate. Scroll over an orb to change its volume; double-click to mute.
- **Atmosphere**: master volume, global hall size, a warmth tilt EQ, and orbit speed.
- **Sleep timer** with a one-minute fade, **mix recording** to a downloadable audio file, **share links** that encode the whole mix in the URL, and auto-save.
- Keyboard shortcuts (press `?`), a responsive mobile layout with drag-to-dismiss sheets, and reduced-motion support.

## Sounds

| Weather | Nature | Urban | Interior | Texture | Tonal |
|---|---|---|---|---|---|
| Rain on Skylight | Ocean Waves | Midnight Shinjuku | Espresso Machine | Vinyl Crackle | Deep Space |
| Distant Thunder | Mountain Stream | Night Train | Fireplace | Brown Noise | Singing Bowl |
| Wind in Pines | Forest Dawn | Café Murmur | Mechanical Keys | Pink Air | Wind Chimes |
| | Summer Crickets | | Grandfather Clock | | Lo-fi Keys |
| | Cave Drips · Abyss | | | | Ethereal Choir |

All the tonal generators share the key of D, so any combination stays consonant.

## Stack

React 19 · TypeScript · Vite · Tailwind CSS v4 · Framer Motion · Zustand · Web Audio API · WebGL

```bash
npm install
npm run dev      # local dev server
npm run build    # production build → dist/
npm run deploy   # build + deploy to Cloudflare Pages
```

## Architecture

- `src/audio/kit.ts`: DSP toolkit (noise colours, envelopes, a `VoiceBuilder` with a per-voice event clock).
- `src/audio/sounds/*`: the procedural generators.
- `src/audio/engine.ts`: the audio graph (channel strips, HRTF panners, hall reverb, glue compressor, limiter, analysers, recorder) and a look-ahead scheduler.
- `src/audio/sync.ts`: diffs store state into the imperative audio graph.
- `src/components/Stage.tsx`: one `requestAnimationFrame` loop that drives orbit motion, panner positions, orb pulse, trails, beams and ripples without React re-renders.
