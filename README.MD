# ◎ Oscillator Visualizer

A browser-based **psychedelic audio visualizer**. Drop in an MP3 and watch it
turn into a living, reactive, kaleidoscopic image driven by the music's
frequencies and beat.

Everything runs **100% client-side** — your audio files never leave your
browser. No server, no upload, no dependencies.

## Use it

Just **double-click `index.html`** to open it in any modern browser (Chrome,
Firefox, Edge, Safari) — no server needed. Then **drag an MP3 onto the page**
(or click to choose a file).

> The visualizer decodes the audio bytes directly with `decodeAudioData()`
> rather than routing an `<audio crossorigin>` element through the Web Audio
> graph. That avoids the cross-origin tainting that would otherwise feed the
> analyser silence on a `file://` page (audible music, but a black screen).

## Visual modes

| Mode | What it does |
|------|--------------|
| **Kaleidoscope** | Mirrored radial spectrum slices around a pulsing core |
| **Warp Tunnel** | Flight through frequency-modulated rings |
| **Spectral Bloom** | A spiraling flower of particles, one per frequency bin |
| **Liquid Waves** | Layered glowing oscilloscope waveforms |

## Controls

- **Sensitivity** — how strongly the audio drives the motion
- **Trails** — motion-blur persistence (lower = longer light trails)
- **Color drift** — how fast the palette cycles
- **Space** — play / pause · **F** — fullscreen

## How it works

The MP3 is decoded by an `<audio>` element and routed through the Web Audio
API's `AnalyserNode`. Each frame we read the FFT frequency data and waveform,
split it into bass / mid / treble bands, run a lightweight beat detector, and
feed those values into a Canvas 2D renderer. See [`app.js`](app.js).
