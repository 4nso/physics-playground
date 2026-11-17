// Genera le icone PNG (schermata Home, Android) a partire da public/icons/icon.svg.
// Si esegue a mano solo quando l'icona cambia:  node scripts/make-icons.cjs
// Serve Playwright con Chromium (presente nelle sessioni cloud di Claude Code).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const dir = path.join(__dirname, '..', 'public', 'icons');
  const svg = fs.readFileSync(path.join(dir, 'icon.svg'), 'utf8');
  const browser = await chromium.launch();
  for (const size of [180, 192, 512]) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(`<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
    await page.screenshot({ path: path.join(dir, `icon-${size}.png`) });
    await page.close();
  }
  await browser.close();
  console.log('Icone generate in public/icons/');
})();
