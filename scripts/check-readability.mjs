import assert from 'node:assert/strict';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';

// This gate measures this static site's actual rendered text. Unsupported paint
// is an explicit failure, rather than an assumed contrast pass.
function measure() {
  const rgba = (value) => {
    const parts = value.match(/[\d.]+/g)?.map(Number);
    if (!/^rgba?\(/.test(value) || !parts || parts.length < 3)
      throw new Error(`Unsupported color: ${value}`);
    return [...parts.slice(0, 3), parts[3] ?? 1];
  };
  const over = (front, back) => [
    ...front.slice(0, 3).map((v, i) => v * front[3] + back[i] * (1 - front[3])),
    1,
  ];
  const luminance = (color) =>
    color.slice(0, 3).reduce((sum, value, i) => {
      const c = value / 255;
      return (
        sum +
        (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4) *
          [0.2126, 0.7152, 0.0722][i]
      );
    }, 0);
  const selector = (el) => {
    if (el.id) return `#${el.id}`;
    const parts = [];
    for (
      let current = el;
      current && current !== document.body;
      current = current.parentElement
    ) {
      const siblings = [...current.parentElement.children].filter(
        (e) => e.tagName === current.tagName,
      );
      parts.unshift(
        `${current.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(current) + 1})`,
      );
    }
    return `body>${parts.join('>')}`;
  };
  const samples = [];
  const exemptions = [];
  const inspect = (el, text, rects) => {
    const style = getComputedStyle(el);
    if (
      style.visibility !== 'visible' ||
      !rects.length ||
      !rects.some((r) => r.width > 0 && r.height > 0)
    )
      return;
    // Off-screen skip links are intentionally invisible until keyboard focus.
    if (rects.every((r) => r.right < 0 || r.bottom < 0)) return;
    if (el.closest('[disabled]')) return;
    const ancestors = [];
    for (let current = el; current; current = current.parentElement)
      ancestors.unshift(current);
    for (const ancestor of ancestors) {
      const clip = getComputedStyle(ancestor).clip;
      const bounds = clip.match(/-?[\d.]+/g)?.map(Number);
      if (
        clip.startsWith('rect(') &&
        bounds?.length === 4 &&
        (bounds[0] === bounds[2] || bounds[1] === bounds[3])
      ) {
        exemptions.push({
          selector: selector(el),
          reason: 'zero-area CSS clip: screen-reader-only text',
        });
        return;
      }
    }
    let background = [255, 255, 255, 1];
    const unknown = [];
    for (const ancestor of ancestors) {
      const s = getComputedStyle(ancestor);
      if (s.backgroundImage !== 'none')
        unknown.push('background image/gradient');
      if (Number(s.opacity) !== 1) unknown.push('group opacity');
      if (s.filter !== 'none' || s.mixBlendMode !== 'normal')
        unknown.push('filter/blending');
      background = over(rgba(s.backgroundColor), background);
    }
    const foreground = over(rgba(style.color), background);
    const light = luminance(foreground);
    const dark = luminance(background);
    const ratio =
      (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05);
    const large =
      parseFloat(style.fontSize) >= 24 ||
      (parseFloat(style.fontSize) >= 18.667 && Number(style.fontWeight) >= 700);
    samples.push({
      selector: selector(el),
      text: text.trim().slice(0, 90),
      foreground,
      background,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      ratio,
      threshold: large ? 3 : 4.5,
      unknown: [...new Set(unknown)],
      overflow: rects.some((r) => r.left < -1 || r.right > innerWidth + 1),
    });
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (
      !node.textContent.trim() ||
      node.parentElement.closest(
        'script,style,noscript,template,[aria-hidden="true"]',
      )
    )
      continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    inspect(node.parentElement, node.textContent, [...range.getClientRects()]);
  }
  for (const control of document.querySelectorAll('input,textarea,select')) {
    if (!control.value) continue;
    inspect(control, control.value, [...control.getClientRects()]);
  }
  return {
    url: location.href,
    width: innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    samples,
    exemptions,
    failures: samples.filter(
      (s) => s.unknown.length || s.ratio < s.threshold || s.overflow,
    ),
  };
}

const site = path.resolve(process.argv[2]);
const output = path.resolve(process.argv[3] || 'readability-artifacts');
const liveIndex = process.argv.indexOf('--live');
const live = liveIndex < 0 ? null : new URL(process.argv[liveIndex + 1]);
await mkdir(output, { recursive: true });
const htmlFiles = [];
async function inventory(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await inventory(file);
    else if (entry.name.endsWith('.html'))
      htmlFiles.push(path.relative(site, file));
  }
}
await inventory(site);
assert.deepEqual(
  htmlFiles,
  ['index.html'],
  'Review route coverage when the public HTML inventory changes',
);
const sitemap = await readFile(path.join(site, 'sitemap.xml'), 'utf8');
assert.deepEqual(
  [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(
    (m) => new URL(m[1]).pathname,
  ),
  ['/'],
);
const server = createServer(async (req, res) => {
  try {
    const file = path.resolve(
      site,
      `.${new URL(req.url, 'http://localhost').pathname}`,
    );
    if (file !== site && !file.startsWith(`${site}${path.sep}`))
      throw new Error('Outside site');
    const target = (await stat(file)).isDirectory()
      ? path.join(file, 'index.html')
      : file;
    const content = await readFile(target);
    const mime = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.xml': 'application/xml',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
    };
    res.writeHead(200, {
      'Content-Type': mime[path.extname(target)] || 'application/octet-stream',
    });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
let browser;
let measured = false;
try {
  browser = await chromium.launch();
  const page = await browser.newPage();
  const runtimeIssues = [];
  page.on('pageerror', (error) =>
    runtimeIssues.push({ url: page.url(), error: error.message }),
  );
  page.on('console', (message) => {
    if (/Content Security Policy|Refused to/.test(message.text()))
      runtimeIssues.push({ url: page.url(), error: message.text() });
  });
  // Controls are outside the site's text corpus and exercise the same browser evaluator.
  await page.setContent(`<body style="background:white;color:black">
    <p style="color:white;background:white">white on white</p>
    <p style="color:#111;background:#102040">dark on navy</p>
    <div style="background:#102040"><p style="background:rgba(255,255,255,.1);color:rgba(255,255,255,.1)">faint alpha text</p></div>
    <input value="unreadable native control" style="color:white;background:white">
    <p style="color:black;background:white">readable control</p>
    <span style="position:absolute;clip:rect(1px,1px,1px,1px);color:white;background:white">clipped screen-reader text</span>
  </body>`);
  const controls = await page.evaluate(measure);
  assert.equal(
    controls.failures.length,
    4,
    'All four known-bad contrast controls must fail',
  );
  assert.equal(
    controls.samples.find((s) => s.text === 'readable control').ratio,
    21,
  );
  assert.equal(
    controls.exemptions.length,
    1,
    'Clipped screen-reader text is not visible paint',
  );
  const origin = live?.origin || `http://127.0.0.1:${server.address().port}`;
  const matrix = [];
  for (const colorScheme of ['light', 'dark']) {
    for (const width of [320, 375, 414, 768, 1440]) {
      for (const scale of [1, 1.5]) {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ colorScheme });
        await page.goto(`${origin}/?readability=${Date.now()}`, {
          waitUntil: 'networkidle',
        });
        const targetSize = await page.evaluate(async (factor) => {
          await document.fonts.ready;
          const size =
            parseFloat(getComputedStyle(document.documentElement).fontSize) *
            factor;
          document.documentElement.style.fontSize = `${size}px`;
          return size;
        }, scale);
        await page.waitForFunction(
          (size) =>
            Math.abs(
              parseFloat(getComputedStyle(document.documentElement).fontSize) -
                size,
            ) < 0.01,
          targetSize,
        );
        await page.waitForTimeout(650);
        assert.equal(await page.locator('h1').count(), 1);
        assert.match(
          await page.locator('#main').innerText(),
          /Affordable Computer Repair/,
        );
        assert.equal(
          await page.evaluate(() => window.jQuery?.fn.jquery),
          '3.7.1',
        );
        const result = await page.evaluate(measure);
        assert.ok(
          result.samples.length > 20,
          'Nonempty actual page text must be measured',
        );
        matrix.push({ colorScheme, scale, state: 'default', ...result });
        await page.screenshot({
          path: path.join(output, `${colorScheme}-${width}-${scale}.png`),
          fullPage: true,
        });
        const toggle = page.locator('.greedy-nav__toggle');
        if (await toggle.isVisible()) {
          await toggle.click();
          assert.ok(
            await page.locator('.hidden-links').isVisible(),
            'Mobile menu must open',
          );
          matrix.push({
            colorScheme,
            scale,
            state: 'expanded menu',
            ...(await page.evaluate(measure)),
          });
          await page.screenshot({
            path: path.join(
              output,
              `${colorScheme}-${width}-${scale}-menu.png`,
            ),
            fullPage: true,
          });
          await toggle.click();
        }
        for (const button of await page.locator('.page__content .btn').all()) {
          const label = await button.innerText();
          await button.hover();
          await page.waitForTimeout(350);
          matrix.push({
            colorScheme,
            scale,
            state: `hover: ${label}`,
            ...(await page.evaluate(measure)),
          });
          await button.focus();
          await page.mouse.move(0, 0);
          await page.waitForTimeout(350);
          matrix.push({
            colorScheme,
            scale,
            state: `focus: ${label}`,
            ...(await page.evaluate(measure)),
          });
          await button.evaluate((el) => el.blur());
        }
      }
    }
  }
  // Check the actual section URL contract without following external action links.
  for (const section of ['services', 'about', 'contact']) {
    await page.goto(`${origin}/#${section}`);
    assert.ok(
      await page.locator(`#${section}`).count(),
      `Missing section ${section}`,
    );
    await page.reload();
    assert.equal(new URL(page.url()).hash, `#${section}`);
    assert.ok(
      (await page.locator(`#${section}`).innerText()).trim().length > 10,
      `Section ${section} must have meaningful content`,
    );
  }
  await page.goto(`${origin}/#services`);
  await page.goto(`${origin}/#contact`);
  await page.goBack();
  assert.equal(new URL(page.url()).hash, '#services');
  await page.goForward();
  assert.equal(new URL(page.url()).hash, '#contact');
  const bad = matrix.filter(
    (cell) => cell.failures.length || cell.documentWidth > cell.width + 1,
  );
  const report = {
    status: matrix.some((cell) => cell.samples.some((s) => s.unknown.length))
      ? 'unmeasured'
      : bad.length || runtimeIssues.length
        ? 'bad'
        : 'ok',
    checkedAt: new Date().toISOString(),
    htmlFiles,
    controls,
    matrix,
    runtimeIssues,
  };
  await writeFile(
    path.join(output, 'readability.json'),
    JSON.stringify(report, null, 2),
  );
  measured = true;
  console.log(
    JSON.stringify({
      cells: matrix.length,
      badCells: bad.map((c) => ({
        width: c.width,
        scale: c.scale,
        colorScheme: c.colorScheme,
        failures: c.failures,
        documentWidth: c.documentWidth,
      })),
      report: path.join(output, 'readability.json'),
    }),
  );
  assert.equal(
    bad.length,
    0,
    'Rendered contrast, unknown paint, or horizontal reflow failure',
  );
  assert.deepEqual(runtimeIssues, [], 'Browser runtime or CSP failure');
} catch (error) {
  if (!measured)
    await writeFile(
      path.join(output, 'unmeasured.json'),
      JSON.stringify({ status: 'unmeasured', error: error.message }),
    );
  throw error;
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
