# Aether — Spatial Ambient Soundscape Mixer

**Live:** https://aether-soundscape.arnavrival12.workers.dev

A floating, visionOS-inspired audio workspace. Drag glowing, translucent sound orbs around the listener at the centre to mix 3D spatial audio in real time. You can also describe a place and let Claude, GPT or Gemini compose the soundscape for you.

**Every sound is synthesised live in the browser** with the Web Audio API: 38 generators that never loop the same way twice. An optional "Realism" control blends in licensed field recordings under ten of them.

## Features

### Spatial audio
- **HRTF binaural panning in 3D:** each orb sits in a 16-metre field and can also be raised or lowered (±4 m).
- **Distance cues:** loudness, air absorption (far sources lose treble) and a distance-driven reverb send.
- **Doppler:** a delay line whose length follows distance, so moving orbs bend in pitch.
- **8 rooms with synthesised impulse responses:** concert hall, cathedral, forest, tiled bathroom, car, cave, studio plate and open field. Switching rooms crossfades between them.
- **Walls:** a sound whose line to you crosses a wall is muffled.
- **Evolving weather:** storms build and pass over a 20-minute arc.
- **Head tracking:** turn your head with the webcam (MediaPipe face landmarks, processed on-device), or turn your phone using its motion sensors.

### Per-orb sound design
- Volume, height, tone, reverb send, and a 3-band EQ.
- Bit-crusher and granular freeze, running in an AudioWorklet.
- Tape stop and spin-up.
- Realism blend between the synthesis and a field recording.
- Mute, solo and duplicate.
- Import your own audio file as an orb. It is stored on your device in IndexedDB.

### Motion & interaction
- **Magnetic orbital rings:** orbs snap onto rings with spring physics and flick projection. Orbit mode makes ringed orbs circle you.
- **Draw a path:** sketch a loop and the orb travels it forever. Dragging the orb carries its path along.
- **Lasso multi-select** and **groups** that move and orbit together.
- **Snapshots:** save mixes and morph between them in polar space over 1–60 s.
- **Undo/redo:** a full history panel you can scrub through, with automatic labels for each step.
- **Pinch / ⌘-scroll zoom,** and a two-finger twist to turn your head.
- **Breathing mode:** 6 breaths a minute, with an on-screen guide.
- **3D tilt view:** a parallax depth view in which orbs float by their height.
- **Haptic ticks and soft UI clicks** on ring crossings and snaps.

### AI Composer (bring your own key)
- **Describe a place:** the model picks the sounds, places them in 3D, and chooses the room, musical key and colour palette. It can also **modify** the current mix.
- **Claude:** official `@anthropic-ai/sdk` with structured outputs (`betaZodOutputFormat`), adaptive thinking at medium effort, and server-side refusal fallbacks. Default model: `claude-opus-5-5`.
- **GPT:** official `openai` SDK with strict JSON-schema output. OpenAI blocks browser calls, so requests go through this site's own Cloudflare Worker relay (`worker/index.ts`). The relay forwards the user's key and never stores it, and only the two endpoints the app needs are allowed.
- **Gemini:** official `@google/genai` SDK with `responseJsonSchema`.
- **Shared schema:** all three providers answer in one Zod schema. Values are validated and clamped before anything touches the mix.
- **Keys and models:** keys stay in the browser. Settings lists the models each key can actually use.

### Visuals
- **Background:** a WebGL domain-warped mesh gradient that reacts to the bass, mid and high bands and morphs to each scene's palette.
- **Orbs:** frosted glass with real refraction of the background (an SVG displacement lens via `backdrop-filter`, Chromium only). They pulse to their own audio level and have animated icons.
- **Field effects:** chromatic refraction trails, particles (rain, embers, bubbles, snow, notes, steam…), sound beams carrying wave packets, ripples on transients, and rings that glow as orbs pass.
- **Visualisers:** spectrum, a scrolling waterfall spectrogram, and a 3D phase scope.
- **Guided first-run tour** with spotlight hints.

### Everything else
- **10 scenes,** on keys 1–9 and 0.
- **Recording and timing:** a sleep timer, recording to an audio file, and share links that encode the whole mix (including walls and room).
- **Persistence:** auto-save, and saved snapshots.
- **Layout and accessibility:** keyboard shortcuts (press `?`), a responsive mobile layout, and reduced-motion support.

## Sounds

| Weather | Nature | Urban | Interior | Texture | Tonal | Focus |
|---|---|---|---|---|---|---|
| Rain on Skylight | Ocean Waves | Midnight Shinjuku | Espresso Machine | Vinyl Crackle | Deep Space | Focus Beats (14 Hz) |
| Distant Thunder | Mountain Stream | Night Train | Fireplace | Brown Noise | Singing Bowl | Sleep Beats (3 Hz) |
| Wind in Pines | Forest Dawn | Café Murmur | Mechanical Keys | Pink Air | Wind Chimes | |
| Rain on a Tent | Summer Crickets | Subway Platform | Grandfather Clock | | Lo-fi Keys | |
| Rain on the Car | Cave Drips | 1950s Diner | Reading Room | | Ethereal Choir | |
| Arctic Wind | Abyss | | Server Room | | Kyoto Temple | |
| | Jungle Night | | Purring Cat | | Ambient Piano | |
| | Moored Sailboat | | | | | |

The tonal generators share the key of D. The ambient piano follows each scene's key and mode, and the time of day.

## Stack

React 19 · TypeScript · Vite · Tailwind CSS v4 · Framer Motion · Zustand · Zod · Web Audio API (AudioWorklet) · WebGL · MediaPipe · Cloudflare Workers

```bash
npm install
npm run dev      # local dev server (the Cloudflare Vite plugin runs the worker locally)
npm run build    # production build → dist/
npm run deploy   # build + deploy to Cloudflare Workers
```

## Architecture

- `src/audio/kit.ts`: the DSP toolkit (noise colours, envelopes, and `VoiceBuilder` with a per-voice event clock).
- `src/audio/sounds/*`: the procedural generators.
- `src/audio/engine.ts`: the audio graph and a look-ahead scheduler. Each channel strip runs synth/recording blend → effects worklet → EQ → tone → evolve → volume → Doppler → tape → mute → occlusion → air → HRTF panner. This feeds dual crossfading room convolvers, a glue compressor and a limiter, plus analysers and the recorder.
- `src/audio/rooms.ts` builds the impulse responses, and `worklet.ts` holds the bit-crush/freeze processor.
- `src/audio/sync.ts`: diffs store state into the imperative audio graph.
- `src/components/Stage.tsx`: a single `requestAnimationFrame` loop drives orbit, paths, group orbit, morphing, breathing, occlusion, panner positions, pulse, trails, beams, particles and ripples, without React re-renders.
- `src/history.ts` handles undo/redo, and `src/morph.ts` handles snapshot morphing.
- `src/ai/`: the provider-agnostic composer.
- `worker/index.ts`: serves the app and the OpenAI relay.

## Credits

Field recordings are from Wikimedia Commons. Three are CC BY 3.0:
- "Regen in de tent" by luc de bruijn
- "Oceanwavescrushing" by Luftrum
- "Campfire sound ambience" by Glaneur de sons

The rest are CC0 or public domain. The full list, with sources and modifications, is in [`public/recordings/CREDITS.md`](public/recordings/CREDITS.md) and in the app's help sheet.
