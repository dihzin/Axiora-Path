const fs = require('fs');
const path = require('path');

const routes = [
  '/child',
  '/child/aprender',
  '/child/axion',
  '/child/games',
  '/child/store',
  '/child/stickers',
  '/child/notifications',
  '/child/help',
  '/child/profile',
  '/child/achievements',
  '/child/settings',
  '/child/games/quiz',
  '/child/games/memory',
  '/child/games/finance-sim',
  '/child/games/tictactoe',
  '/child/games/wordsearch',
  '/child/games/tug-of-war',
];

const viewports = [
  { key: 'desktop', width: 1440, height: 900 },
  { key: 'mobile', width: 390, height: 844 },
];

const outDir = 'c:/DEV/Axiora Path/output/playwright/child-audit';
fs.mkdirSync(outDir, { recursive: true });

const results = [];

for (const vp of viewports) {
  await page.setViewportSize({ width: vp.width, height: vp.height });
  for (const route of routes) {
    const url = `http://localhost:3000${route}`;
    let item = { viewport: vp.key, route, targetUrl: url };
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(1200);

      const diagnostics = await page.evaluate(() => {
        const asides = Array.from(document.querySelectorAll('aside'));
        const fixedLeftAside = asides.find((el) => {
          const s = window.getComputedStyle(el);
          return s.position === 'fixed' && s.left === '0px';
        }) || null;

        const main = document.querySelector('main');
        const text = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
        const firstChunky = document.querySelector('.axiora-chunky-btn');
        const chunkyRadius = firstChunky ? window.getComputedStyle(firstChunky).borderRadius : null;

        const sidebarStyles = fixedLeftAside
          ? window.getComputedStyle(fixedLeftAside)
          : null;

        const sidebarBg = sidebarStyles?.backgroundImage || '';
        const sidebarTrailLike = sidebarBg.includes('linear-gradient') && (
          sidebarBg.includes('6, 18, 39') || sidebarBg.includes('4, 13, 30')
        );

        const hasApiErrorHint = /indisponível|nao foi possivel|não foi possível|erro/i.test(text);

        return {
          finalUrl: window.location.href,
          title: document.title,
          hasMain: Boolean(main),
          textSize: text.length,
          hasChunkyButton: Boolean(firstChunky),
          chunkyRadius,
          hasFixedLeftSidebar: Boolean(fixedLeftAside),
          sidebarBg,
          sidebarTrailLike,
          hasApiErrorHint,
        };
      });

      const safeRoute = route.replace(/^\//, '').replace(/\//g, '__') || 'child';
      const screenshotPath = path.join(outDir, `${vp.key}__${safeRoute}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });

      item = { ...item, ok: true, screenshotPath, ...diagnostics };
    } catch (error) {
      item = { ...item, ok: false, error: String(error && error.message ? error.message : error) };
    }
    results.push(item);
  }
}

fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(results, null, 2));
({ outDir, total: results.length, failed: results.filter((r) => !r.ok).length });
