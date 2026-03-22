import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const outDir = 'c:/DEV/Axiora Path/output/playwright/child-audit';
fs.mkdirSync(outDir, { recursive: true });

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

async function signup(page) {
  const email = `pwchild${Date.now()}@axiora.local`;
  await page.goto('http://localhost:3000/signup', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.getByRole('textbox', { name: 'Nome' }).fill('Playwright Child');
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByRole('textbox', { name: 'Família' }).fill('Familia Playwright');
  await page.getByRole('textbox', { name: 'Senha' }).fill('Axion@1234');
  await page.getByRole('button', { name: 'Criar conta com email' }).click();
  await page.waitForTimeout(2500);
  return { email, finalUrl: page.url() };
}

async function auditRoutes(page, viewportKey) {
  const results = [];
  for (const route of routes) {
    const targetUrl = `http://localhost:3000${route}`;
    const consoleErrors = [];
    const responseErrors = [];

    const onConsole = (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    };
    const onResponse = (res) => {
      if (res.status() >= 400) {
        const url = res.url();
        if (url.includes('/api/') || url.includes('/auth/') || url.includes('/axion/') || url.includes('/child/')) {
          responseErrors.push(`${res.status()} ${url}`);
        }
      }
    };

    page.on('console', onConsole);
    page.on('response', onResponse);

    let item = { viewport: viewportKey, route, targetUrl };
    try {
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(1200);

      const diagnostics = await page.evaluate(() => {
        const asides = Array.from(document.querySelectorAll('aside'));
        const fixedLeftAside = asides.find((el) => {
          const s = window.getComputedStyle(el);
          return s.position === 'fixed' && s.left === '0px';
        }) || null;

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

        return {
          finalUrl: window.location.href,
          title: document.title,
          hasMain: Boolean(document.querySelector('main')),
          textSize: text.length,
          hasChunkyButton: Boolean(firstChunky),
          chunkyRadius,
          hasFixedLeftSidebar: Boolean(fixedLeftAside),
          sidebarBg,
          sidebarTrailLike,
          hasApiErrorHint: /indisponível|nao foi possivel|não foi possível|erro/i.test(text),
        };
      });

      const safeRoute = route.replace(/^\//, '').replace(/\//g, '__') || 'child';
      const screenshotPath = path.join(outDir, `${viewportKey}__${safeRoute}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });

      item = {
        ...item,
        ok: true,
        screenshotPath,
        consoleErrorCount: consoleErrors.length,
        responseErrorCount: responseErrors.length,
        consoleErrors: consoleErrors.slice(0, 8),
        responseErrors: responseErrors.slice(0, 12),
        ...diagnostics,
      };
    } catch (error) {
      item = { ...item, ok: false, error: String(error?.message || error) };
    } finally {
      page.off('console', onConsole);
      page.off('response', onResponse);
    }

    results.push(item);
  }
  return results;
}

const browser = await chromium.launch({ headless: true });

const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const desktopPage = await desktopContext.newPage();
const signupResult = await signup(desktopPage);
const desktopResults = await auditRoutes(desktopPage, 'desktop');
const storagePath = path.join(outDir, 'state.json');
await desktopContext.storageState({ path: storagePath });
await desktopContext.close();

const mobileContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
  storageState: storagePath,
});
const mobilePage = await mobileContext.newPage();
const mobileResults = await auditRoutes(mobilePage, 'mobile');
await mobileContext.close();

await browser.close();

const all = { signupResult, generatedAt: new Date().toISOString(), results: [...desktopResults, ...mobileResults] };
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(all, null, 2));

const failed = all.results.filter((r) => !r.ok).length;
console.log(JSON.stringify({ outDir, total: all.results.length, failed, signupUrl: signupResult.finalUrl }, null, 2));
