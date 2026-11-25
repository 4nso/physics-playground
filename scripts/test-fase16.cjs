// Test headless delle correzioni della fase 16 (docs/ROADMAP.md, fase 16 → "Correzioni").
// Si esegue così (serve Playwright con Chromium, presente nelle sessioni cloud di Claude Code):
//   node scripts/test-fase16.cjs            tutti i controlli (~4 minuti)
//   node scripts/test-fase16.cjs --veloce   2 minuti di partita diventano 30 secondi
// Avvia da solo il server di sviluppo (vite) su una porta libera e lo chiude alla fine.
// Controlli:
//   1. oggetti fisici (casse, palle) appoggiati dopo il caricamento: niente a mezz'aria, niente dentro i muri
//   2. dopo 2 minuti di partita (nemici veri che inseguono il giocatore in backrooms, parcheggio e luna park)
//      nessun nemico è dentro un muro e nessuno ne ha attraversato uno (controllo a ogni fotogramma)
//   3. nei corridoi delle backrooms i colpi arrivano ai nemici (non si fermano su muri o oggetti invisibili)
//   4. (solo se c'è il pacchetto "peer") in multiplayer un client con una versione diversa viene rifiutato
// Esce con codice 1 se un controllo fallisce.
const { spawn } = require('child_process');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PORT = 5199;
const FAST = process.argv.includes('--veloce');
const GAME_SECONDS = FAST ? 30 : 120;
const URL = `http://localhost:${PORT}/physics-playground/`;
const results = [];
const check = (name, ok, info) => { results.push({ name, ok }); console.log(`${ok ? '✅' : '❌'} ${name}${info ? ' — ' + info : ''}`); };

function startVite() {
  // vite avviato direttamente con node (con npx, chiudendo npx il server resterebbe acceso)
  const bin = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  const p = spawn(process.execPath, [bin, '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('vite non parte')), 30000);
    p.stdout.on('data', (d) => { if (String(d).includes('Local')) { clearTimeout(t); resolve(p); } });
    p.on('exit', (c) => reject(new Error('vite uscito: ' + c)));
  });
}

async function openGame(browser, query = '', size = { width: 400, height: 260 }) {
  const page = await browser.newPage({ viewport: size });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL + '?' + query);
  await page.waitForFunction(() => window.__pp && __pp.physics, null, { timeout: 60000 });
  return { page, errors };
}
async function play(page) {
  await page.click('#play');
  await page.waitForFunction(() => __pp.game.state === 'playing', null, { timeout: 60000 });
}

/* ---------- 1. Oggetti appoggiati ---------- */
async function testObjects(browser) {
  let bad = [], total = 0, errs = [];
  for (const seed of [1234, 777, 4242]) {
    const { page, errors } = await openGame(browser, `seed=${seed}`);
    await play(page);
    await page.waitForTimeout(6000); // gli oggetti cadono e si fermano
    const r = await page.evaluate(() => {
      const out = [];
      __pp.scene.traverse((m) => {
        const o = m.userData && m.userData.obj;
        if (!o || o.kind === 'wreck') return;
        const t = o.body.translation();
        const half = o.kind === 'crate' ? m.scale.x / 2 : m.scale.x;
        // raggi verso il basso dal centro e (per le casse) dai 4 angoli: conta il più corto
        const offs = o.kind === 'crate' ? [[0, 0], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]] : [[0, 0]];
        let gap = Infinity;
        for (const [ox, oz] of offs) {
          const h = __pp.castWorld({ x: t.x + ox * half, y: t.y, z: t.z + oz * half }, { x: 0, y: -1, z: 0 }, 30, m);
          if (h) gap = Math.min(gap, h.distance - half);
        }
        // anche il disegno deve stare dove sta il corpo fisico
        const drawn = Math.hypot(m.position.x - t.x, m.position.y - t.y, m.position.z - t.z);
        const v = o.body.linvel(), speed = Math.hypot(v.x, v.y, v.z);
        out.push({ k: o.kind, x: +t.x.toFixed(1), y: +t.y.toFixed(2), z: +t.z.toFixed(1), gap: +gap.toFixed(2), drawn: +drawn.toFixed(2), speed: +speed.toFixed(2) });
      });
      return out;
    });
    total += r.length;
    // solo oggetti fermi: una palla che sta ancora rotolando o rimbalzando non è "sospesa"
    bad.push(...r.filter((o) => o.speed < 0.2 && (!(o.gap < 0.12 && o.gap > -0.15) || o.drawn > 0.05)).map((o) => ({ seed, ...o })));
    const moving = r.filter((o) => o.speed >= 0.2).length;
    if (moving) console.log(`    seed ${seed}: ${moving} oggetti ancora in movimento (non controllati)`);
    errs.push(...errors);
    await page.close();
  }
  check('Oggetti fisici appoggiati dopo il caricamento (3 seed)', bad.length === 0, `${total} oggetti, ${bad.length} fuori posto`);
  for (const b of bad.slice(0, 8)) console.log('   ', JSON.stringify(b));
  return errs;
}

/* ---------- 2. Nemici e muri dopo 2 minuti ---------- */
async function testWalls(browser) {
  const { page, errors } = await openGame(browser, 'seed=1234', { width: 320, height: 200 });
  await play(page);
  await page.evaluate(() => {
    __pp.dev.god = true;
    __pp.game.round = 7; __pp.game.timer = 0; // round 8: tanti nemici
    const { world, RAPIER } = __pp.physics;
    const flags = RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC | RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC | RAPIER.QueryFilterFlags.EXCLUDE_SENSORS;
    const ball = new RAPIER.Ball(0.12), rot = { x: 0, y: 0, z: 0, w: 1 };
    const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
    const W = window.__walls = { frames: 0, gameT: 0, inside: [], cross: [], seen: new Set() };
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      W.frames++; W.gameT += Math.min(0.05, (now - last) / 1000); last = now;
      for (const e of __pp.enemies) {
        W.seen.add(e.id);
        const t = e.body.translation();
        // a) attraversamento: raggio tra la posizione del fotogramma prima e quella di adesso
        if (e._pp) {
          const dx = t.x - e._pp.x, dy = t.y - e._pp.y, dz = t.z - e._pp.z, L = Math.hypot(dx, dy, dz);
          if (L > 0.02 && L < 3) {
            ray.origin.x = e._pp.x; ray.origin.y = e._pp.y; ray.origin.z = e._pp.z;
            ray.dir.x = dx / L; ray.dir.y = dy / L; ray.dir.z = dz / L;
            if (world.castRay(ray, L, false, flags)) W.cross.push({ id: e.id, v: e.variant, from: [e._pp.x, e._pp.y, e._pp.z].map((v) => +v.toFixed(2)), to: [t.x, t.y, t.z].map((v) => +v.toFixed(2)), climb: +(e.climbT || 0).toFixed(2) });
          }
        }
        e._pp = { x: t.x, y: t.y, z: t.z };
        // b) dentro un muro: piccole sfere lungo l'asse della capsula toccano un collider fisso?
        if (W.frames % 4 === 0) {
          for (const dy of [-0.25, 0, 0.25]) {
            let hit = false;
            world.intersectionsWithShape({ x: t.x, y: t.y + dy * e.v.scale, z: t.z }, rot, ball, () => { hit = true; return false; }, flags);
            if (hit) { W.inside.push({ id: e.id, v: e.variant, at: [t.x, t.y, t.z].map((v) => +v.toFixed(2)), climb: +(e.climbT || 0).toFixed(2) }); break; }
          }
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  // il giocatore si sposta ogni 5 secondi (i nemici devono girare angoli, salire rampe e scale)
  const spots = [[48, 0.05, 1.5], [36.5, 0.05, 1.5], [60.5, 0.05, -10.5], [42, 0.05, 25.5], [-30, 7.05, 20], [-41, 3.55, -22], [10, 0.05, 7.5], [-8, 0.05, 18], [54, 0.05, -28.5]];
  let k = 0, gameT = 0;
  const t0 = Date.now();
  while (gameT < GAME_SECONDS && Date.now() - t0 < GAME_SECONDS * 6000) {
    await page.waitForTimeout(5000);
    const s = spots[k++ % spots.length];
    gameT = await page.evaluate((s) => { __pp.teleport(s[0], s[1], s[2]); return __walls.gameT; }, s);
  }
  const r = await page.evaluate(() => ({ frames: __walls.frames, gameT: __walls.gameT, inside: __walls.inside, cross: __walls.cross, enemies: __walls.seen.size }));
  check(`Nessun nemico dentro un muro (${Math.round(r.gameT)} s di partita, ${r.enemies} nemici)`, r.inside.length === 0, `${r.inside.length} casi`);
  for (const x of r.inside.slice(0, 6)) console.log('   ', JSON.stringify(x));
  check('Nessun nemico attraversa un muro (controllo a ogni fotogramma)', r.cross.length === 0, `${r.cross.length} casi su ${r.frames} fotogrammi`);
  for (const x of r.cross.slice(0, 6)) console.log('   ', JSON.stringify(x));
  await page.close();
  return errors;
}

/* ---------- 3. Colpi nei corridoi delle backrooms ---------- */
async function testShots(browser) {
  const { page, errors } = await openGame(browser, 'seed=1234', { width: 320, height: 200 });
  await play(page);
  // un solo nemico di prova, fermo (stordito), che si sposta da un corridoio all'altro
  await page.evaluate(() => {
    __pp.dev.god = true; __pp.game.toSpawn = 0;
    const e = __pp.spawnEnemy('base', { round: 1, health: 1e9, damage: 0 }, { x: 48, y: 0, z: 1.5 });
    e.stun = 1e9;
    window.__shot = e;
  });
  await page.waitForFunction(() => __shot.spawnT >= 1, null, { timeout: 30000 });
  let ok = 0, n = 0, skipped = 0;
  const fails = [];
  for (let k = 0; k < 40; k++) {
    const placed = await page.evaluate(() => {
      const nav = __pp.nav, { world, RAPIER } = __pp.physics;
      const flags = RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC | RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC;
      const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
      const back = [...nav.aliveList].filter((a) => nav.x[a] > 34 && nav.x[a] < 62 && nav.z[a] < 36 && nav.y[a] === 0 && !nav.near[a]);
      for (let tries = 0; tries < 500; tries++) {
        const a = back[(Math.random() * back.length) | 0], b = back[(Math.random() * back.length) | 0];
        const dx = nav.x[b] - nav.x[a], dz = nav.z[b] - nav.z[a], L = Math.hypot(dx, dz);
        if ((dx !== 0 && dz !== 0) || L < 3 || L > 12) continue; // stesso corridoio (riga o colonna)
        let blocked = false;
        for (const y of [0.4, 1.0, 1.55]) {
          ray.origin.x = nav.x[a]; ray.origin.y = y; ray.origin.z = nav.z[a]; ray.dir.x = dx / L; ray.dir.y = 0; ray.dir.z = dz / L;
          if (world.castRay(ray, L, true, flags)) blocked = true;
        }
        if (blocked) continue;
        __pp.teleport(nav.x[a], 0.05, nav.z[a]);
        __shot.body.setTranslation({ x: nav.x[b], y: nav.y[b] + __shot.centerY + 0.02, z: nav.z[b] }, true);
        __shot.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        return { a: [nav.x[a], nav.z[a]], b: [nav.x[b], nav.z[b]] };
      }
      return null;
    });
    if (!placed) continue;
    await page.waitForTimeout(500); // qualche fotogramma: telecamera e modello al loro posto
    const h = await page.evaluate(() => {
      const t = __shot.body.translation(), c = __pp.camera.position;
      const d = { x: t.x - c.x, y: t.y + 0.15 - c.y, z: t.z - c.z }, L = Math.hypot(d.x, d.y, d.z);
      d.x /= L; d.y /= L; d.z /= L;
      const hit = __pp.castWorld({ x: c.x, y: c.y, z: c.z }, d, 60);
      const what = !hit ? 'niente' : hit.object ? (hit.object.userData.enemy === __shot ? 'nemico' : hit.object.userData.obj ? 'cassa o palla' : 'altro') : 'muro ' + hit.surface + (hit.hidden ? ' (invisibile)' : '');
      return { what, dist: hit ? +hit.distance.toFixed(2) : -1, L: +L.toFixed(2) };
    });
    // una cassa o una palla vera in mezzo ferma il colpo, ed è giusto: quel caso non conta
    if (h.what === 'cassa o palla') { skipped++; continue; }
    n++;
    if (h.what === 'nemico') ok++; else fails.push({ ...placed, ...h });
  }
  check('Colpi che arrivano ai nemici nei corridoi delle backrooms', n >= 20 && ok === n, `${ok}/${n}${skipped ? `, ${skipped} con una cassa o una palla in mezzo (non contati)` : ''}`);
  for (const f of fails.slice(0, 6)) console.log('   ', JSON.stringify(f));
  await page.close();
  return errors;
}

/* ---------- 4. Multiplayer: versione diversa rifiutata (facoltativo) ---------- */
async function testVersion(browser) {
  let srv = null;
  try {
    const express = require('express');
    const { ExpressPeerServer } = require('peer');
    const app = express();
    srv = app.listen(9019, '127.0.0.1');
    app.use('/', ExpressPeerServer(srv, { path: '/' }));
  } catch (e) {
    console.log('⏭️  Versione in multiplayer: saltato (servono i pacchetti "peer" ed "express")');
    return [];
  }
  const H = await openGame(browser, 'peer=127.0.0.1:9019'), C = await openGame(browser, 'peer=127.0.0.1:9019');
  await H.page.click('#create');
  await H.page.waitForFunction(() => /^[A-Z0-9]{5}$/.test(document.getElementById('lCode').textContent), null, { timeout: 20000 });
  const code = await H.page.$eval('#lCode', (e) => e.textContent);
  await C.page.evaluate(() => { __pp.net.build = 'versione-vecchia'; });
  await C.page.click('#joinBtn'); await C.page.fill('#jCode', code); await C.page.click('#jGo');
  await C.page.waitForTimeout(6000);
  const joined = await H.page.evaluate(() => __pp.net.clients.size);
  const text = await C.page.evaluate(() => document.body.innerText);
  check('Multiplayer: un client con una versione diversa non entra', joined === 0 && /versioni diverse/.test(text));
  // e con la stessa versione entra
  await C.page.reload();
  await C.page.waitForFunction(() => window.__pp && __pp.physics, null, { timeout: 60000 });
  await C.page.click('#joinBtn'); await C.page.fill('#jCode', code); await C.page.click('#jGo');
  await H.page.waitForFunction(() => __pp.net.clients.size > 0, null, { timeout: 20000 }).catch(() => {});
  check('Multiplayer: con la stessa versione si entra', (await H.page.evaluate(() => __pp.net.clients.size)) === 1);
  await H.page.close(); await C.page.close();
  srv.close();
  return [];
}

(async () => {
  const vite = await startVite();
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  try {
    errors.push(...await testObjects(browser));
    errors.push(...await testShots(browser));
    errors.push(...await testWalls(browser));
    errors.push(...await testVersion(browser));
    const real = errors.filter((e) => !/GPU stall|GL Driver/.test(e));
    check('Nessun errore in console', real.length === 0, real.slice(0, 3).join(' | '));
  } finally {
    await browser.close();
    vite.kill();
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(failed ? `\n${failed} controlli falliti` : '\nTutti i controlli passati');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
