# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Mobile audio guide for the ITMO MEGA BATTLE student event, styled like a music player (YouTube Music–like). A visitor scans an exhibit QR with the phone camera → the player opens with that exhibit's cover and narration; further exhibits are scanned with the in-player scanner so the ambient bed keeps playing. Vanilla JS + Vite, no framework. All UI text and README are in Russian.

## Commands

```sh
npm run dev       # vite --host (LAN-accessible)
npm run build     # → dist/ (build output, gitignored)
npm run preview
npm run qr        # regenerate public/qr/*.png from public/config.json
```

No automated tests. The live camera scanner needs a secure context (HTTPS or localhost).

## Architecture

- **`public/config.json` is the single source of content**: `siteUrl`, `ambient`, and `tracks[]` (`id`, `title`, `artist`, `audio`, `cover`, `qr`). It is fetched at runtime (top-level `await` in `src/main.js`; controls stay `disabled` until it loads), so it can be edited on the host without a rebuild. Paths are relative to `public/` and used as-is: they resolve against the document URL (the page always lives at its directory URL, `?t=` only changes the query). `scripts/qr.js` reads the same file. Adding a track = drop files into `public/{audio,covers}` + add a config entry + `npm run qr`.
- **Track links/QR payloads** are `<siteUrl>/?t=<id>`, built/parsed only via `src/track-link.js` (DOM-free, also imported by `scripts/qr.js`). `findTrack()` in `src/main.js` accepts them only from `location.origin` or `siteUrl`'s origin; anything else returns -1 (unknown QR must never navigate away). Printed QR codes depend on `id` — don't renumber.
- **`src/player.js`** — `Player`: a single reused `voice` `<audio>` (Safari may block `play()` on a fresh element after a camera scan, so `load()` swaps `src`) plus a looping `bed` (ambient). UI state is derived from the media elements (`playing`, `loading`, `speaking`, `ambientPlaying`, `position`, `duration`) and pushed via `onChange`; no custom state machine. Player holds no UI text: it exposes a `Problem` enum and `main.js` maps it to Russian messages. `AbortError` from `play()` means superseded by pause/track switch and is ignored. When narration ends the bed keeps playing (`playing` stays true).
- **`src/scanner.js`** — `Scanner` around a `<dialog>`: `getUserMedia` → `setTimeout` loop calling `detector.detect(video)`. The detector is the native `BarcodeDetector` when it supports `qr_code` (Chrome on Android), otherwise the `barcode-detector/ponyfill` (ZXing-C++ WASM, ~400 KB gzip), dynamically imported and started while the camera permission prompt is open. The `.wasm` is self-hosted via `import … from 'zxing-wasm/reader/zxing_reader.wasm?url'` + `prepareZXingModule({ overrides: { locateFile } })` — without that it loads from jsDelivr. `zxing-wasm` is intentionally not a direct dependency: `barcode-detector` pins its exact version. `#session` is bumped on every stop so stale camera starts/loops bail out; closing the dialog always releases the stream.
- **`src/main.js`** — wiring: renders player state into the DOM, prev/next, seek, volume, Media Session, keeps `?t=` in the URL via `replaceState`. Right after start `preloadMedia()` fetches all covers, then all audio, sequentially (next exhibits first, current last) into Blob URLs held for the session (`preloaded` map keyed by config path), so scans don't depend on venue Wi-Fi; `showTrack` falls back to the network URL until a blob is ready. Media Session artwork always uses the network URL. Nothing persists across reloads.
- **`src/style.css`** — one stylesheet; phone sizing via `max-height` media queries (750px, 640px). Font is `@fontsource-variable/raleway` (`'Raleway Variable'`).
