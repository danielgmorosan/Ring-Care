// Serve dist/ on the sub-path /x/y/ and screenshot every screen at phone and desktop sizes.
// PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers PLAYWRIGHT_MODULE=$(npm root -g)/playwright node demo/web/screenshot.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const DIST = path.join(__dirname, 'dist');
const OUT = path.join(__dirname, 'screenshots');
const BASE = '/x/y/';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.ico': 'image/x-icon', '.png': 'image/png', '.json': 'application/json' };

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (!u.pathname.startsWith(BASE)) { res.writeHead(404); res.end('outside sub-path: ' + u.pathname); console.log('404 outside', u.pathname); return; }
  let rel = u.pathname.slice(BASE.length) || 'index.html';
  const file = path.join(DIST, rel);
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); console.log('404', u.pathname); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

async function run() {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}${BASE}`;
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
  const problems = [];

  for (const [label, viewport] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 860 }]]) {
    const ctx = await browser.newContext({ viewport, timezoneId: 'Europe/Lisbon', locale: 'en-GB', deviceScaleFactor: label === 'phone' ? 2 : 1 });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`[${label}] console.${m.type()}: ${m.text()}`); });
    page.on('pageerror', (e) => problems.push(`[${label}] pageerror: ${e.message}`));
    page.on('requestfailed', (r) => problems.push(`[${label}] requestfailed: ${r.url()}`));

    const shot = async (name, full = true) => {
      await page.waitForTimeout(450);
      const file = `${OUT}/${label}-${name}.png`;
      if (full) {
        // RN-web scrolls inside a ScrollView: grow the viewport to the content for one shot.
        const h = await page.evaluate(() => {
          let max = 0;
          document.querySelectorAll('div').forEach((d) => {
            const cs = getComputedStyle(d);
            if (/(auto|scroll)/.test(cs.overflowY) && d.scrollHeight > d.clientHeight) max = Math.max(max, d.scrollHeight - d.clientHeight);
          });
          return max;
        });
        if (h > 0) {
          await page.setViewportSize({ width: viewport.width, height: Math.min(viewport.height + h, 6000) });
          await page.waitForTimeout(300);
        }
        await page.screenshot({ path: file });
        if (h > 0) await page.setViewportSize(viewport);
      } else {
        await page.screenshot({ path: file });
      }
      console.log('saved', file);
    };
    const tab = (name) => page.getByText(name, { exact: true }).last().click();

    await page.goto(url);
    await page.getByText('I already have an account').click();
    await page.getByPlaceholder('you@example.com').fill('sofia@example.com');
    await page.getByPlaceholder('Your password').fill('demo-pass-123');
    await shot('00-login', false);
    await page.getByText('Sign in', { exact: true }).click();
    await page.getByText('Ferreira').first().waitFor();
    await page.waitForTimeout(600);
    await shot('01-home');

    await page.getByPlaceholder('How is everything?').fill('How was Mom today?');
    await page.getByText('Ask', { exact: true }).click();
    await page.getByText('Nothing else needed your attention.').waitFor();
    await page.getByText('Nothing else needed your attention.').scrollIntoViewIfNeeded();
    await shot('02-home-ask', false);

    await tab('Alerts');
    await page.getByText("What we've flagged").waitFor();
    await shot('03-alerts');

    await tab('Timeline');
    await page.getByText('Front door at night').first().waitFor();
    await shot('04-timeline');
    await page.getByText('Front door at night').first().click();
    await page.getByText('Pressed 1. Handling it.').waitFor();
    await shot('05-incident-night-door');
    await page.getByText(/Timeline/).first().click().catch(() => {});
    await page.waitForTimeout(400);
    // The older fall sample, too.
    const fall = page.getByText('Possible fall').first();
    if (await fall.isVisible().catch(() => false)) {
      await fall.click();
      await page.waitForTimeout(800);
      await shot('06-incident-fall');
    }

    await tab('Care');
    await page.getByText('Approve all').waitFor();
    await shot('07-care-bee-inbox');
    await page.getByText('Approve all').click();
    await page.getByText('Added to the care plan').waitFor();
    await page.getByText('Added to the care plan').scrollIntoViewIfNeeded();
    await shot('08-care-approved');

    await tab('People');
    await page.getByText('Miguel').first().waitFor();
    await shot('09-contacts');

    await tab('Home');
    await page.getByText('Open Ring').click();
    await page.getByText('Night door').first().waitFor();
    await shot('10-ring');
    await page.getByText('See live').first().click();
    await page.getByText("We couldn't open the camera").waitFor({ timeout: 15000 });
    await shot('11-ring-live-unavailable', false);

    await ctx.close();
  }
  await browser.close();
  server.close();
  console.log('\nPROBLEMS:\n' + (problems.join('\n') || 'none'));
}
run().catch((e) => { console.error(e); server.close(); process.exit(1); });
