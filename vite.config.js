import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

// Versione mostrata in "Copia stato" (modalità sviluppatore): numero, commit e data della build.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
let commit = '';
try { commit = execSync('git rev-parse --short HEAD').toString().trim(); } catch (e) { /* niente git */ }
const VERSION = `${pkg.version}${commit ? ' · ' + commit : ''} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`;

// Motore di MediaPipe (WASM, ~14 MB) per il ritaglio intelligente dei volti (src/faces/detect.js).
// Non sta nel repository: si prende da node_modules e si copia nella build in "mediapipe/".
// Il browser lo scarica solo quando si aggiunge una foto nella galleria.
const MP_DIR = fileURLToPath(new URL('./node_modules/@mediapipe/tasks-vision/wasm/', import.meta.url));
const MP_FILES = ['vision_wasm_internal.js', 'vision_wasm_internal.wasm'];
const mediapipeWasm = () => ({
  name: 'mediapipe-wasm',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const m = req.url && req.url.match(/\/mediapipe\/([\w.]+)(\?.*)?$/);
      if (!m || !MP_FILES.includes(m[1])) return next();
      res.setHeader('Content-Type', m[1].endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
      res.end(readFileSync(MP_DIR + m[1]));
    });
  },
  generateBundle() {
    for (const f of MP_FILES) this.emitFile({ type: 'asset', fileName: `mediapipe/${f}`, source: readFileSync(MP_DIR + f) });
  },
});

// GitHub Pages pubblica il sito in https://4nso.github.io/physics-playground/
export default defineConfig({
  base: '/physics-playground/',
  plugins: [mediapipeWasm()],
  define: { __APP_VERSION__: JSON.stringify(VERSION) },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 6000, // Rapier include il motore fisico (WASM) dentro il JS
  },
});
