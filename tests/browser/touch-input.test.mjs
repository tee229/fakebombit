import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium, webkit } from 'playwright';
import { createServer } from 'vite';

let server, browser, url;
const engine = process.env.PLAYWRIGHT_BROWSER === 'webkit' ? webkit : chromium;
const viewport = engine === webkit ? { width: 1180, height: 820 } : { width: 960, height: 400 };
before(async () => {
  server = await createServer({ server: { host: '127.0.0.1', port: 0, strictPort: true } });
  await server.listen();
  url = server.resolvedUrls.local[0];
  browser = await engine.launch({ headless: true, ...(engine === chromium && process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
});
after(async () => { await browser?.close(); await server?.close(); });

for (const mode of ['floating', 'fixed']) {
  test(`${mode}: right-hand bomb press/release preserves held left-hand movement`, async () => {
    const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true });
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(5000);
      await page.goto(`${url}?arena=training&acceptance=1${mode === 'floating' ? '&touchTrace=1' : ''}`);
      await page.getByRole('button', { name: '返回游戏并记录', exact: true }).click();
      await page.getByRole('button', { name: '验收报告', exact: true }).waitFor({ state: 'visible' });
      const reportButton = await page.getByRole('button', { name: '验收报告', exact: true }).boundingBox();
      assert.ok(reportButton.x >= 12, 'diagnostic entry must stay inside the screen');
      assert.ok(reportButton.y + reportButton.height <= viewport.height - 12, 'diagnostic entry must keep its bottom margin');
      await page.getByRole('button', { name: '打开设置', exact: true }).click();
      await page.getByRole('radio', { name: mode === 'floating' ? '浮动摇杆' : '固定摇杆', exact: true }).check();
      await page.getByRole('button', { name: '完成', exact: true }).click();
      await page.getByRole('button', { name: '开始游戏', exact: true }).click();
      const canvas = page.locator('canvas');
      await page.waitForFunction(() => document.querySelector('canvas')?.dataset.flowPhase === 'playing');
      const bounds = await canvas.boundingBox();
      const layout = JSON.parse(await canvas.getAttribute('data-viewport-layout'));
      const left = { id: 1, x: bounds.x + layout.joystick.x, y: bounds.y + layout.joystick.y };
      const right = { id: 2, x: bounds.x + layout.bomb.x, y: bounds.y + layout.bomb.y };
      // Playwright 1.62.1 exposes only a tap publicly for WebKit. Use its pinned
      // native protocol session for multi-touch, never DOM-dispatched pointer events.
      const session = engine === webkit ? page._connection.toImpl(page).delegate._pageProxySession : await context.newCDPSession(page);
      const touch = (type, points) => session.send('Input.dispatchTouchEvent', { type, touchPoints: points });
      const bombDown = (left, right) => touch('touchStart', engine === webkit ? [right] : [left, right]);
      const direction = expected => page.waitForFunction(value => document.querySelector('canvas')?.dataset.joystick === value, expected, { timeout: 1500 });
      const advancing = async () => {
        const x = Number(await canvas.getAttribute('data-player-x'));
        await page.waitForFunction(before => Number(document.querySelector('canvas')?.dataset.playerX) > before + .1, x, { timeout: 1500 });
      };
      await touch('touchStart', [left]);
      left.x += layout.joystick.radius * .5;
      await touch('touchMove', [left]);
      await direction('right');
      const center = await canvas.getAttribute('data-joystick-center');
      await bombDown(left, right);
      await page.waitForFunction(() => document.querySelector('.bomb-control')?.classList.contains('held'));
      await advancing();
      assert.equal(await canvas.getAttribute('data-joystick'), 'right');
      assert.equal(await canvas.getAttribute('data-joystick-center'), center);
      assert.equal(await canvas.getAttribute('data-bombs'), '1');
      // CDP touchEnd lists the points being released, not the points remaining.
      await touch('touchEnd', [right]);
      await page.waitForFunction(() => !document.querySelector('.bomb-control')?.classList.contains('held'));
      await advancing();
      assert.equal(await canvas.getAttribute('data-joystick'), 'right');
      assert.equal(await canvas.getAttribute('data-joystick-center'), center);
      await touch('touchEnd', [left]);
      await direction('');
      if (mode === 'floating') assert.equal(await canvas.getAttribute('data-joystick-center'), '');

      // A real browser cancellation must still clear both controls.
      await touch('touchStart', [left]);
      left.x += layout.joystick.radius * .5;
      await touch('touchMove', [left]);
      await direction('right');
      await bombDown(left, right);
      await page.waitForFunction(() => document.querySelector('.bomb-control')?.classList.contains('held'));
      await touch('touchCancel', engine === webkit ? [left, right] : []);
      await direction('');
      await page.waitForFunction(() => !document.querySelector('.bomb-control')?.classList.contains('held'));
      await page.getByRole('button', { name: '暂停游戏', exact: true }).click();
      await page.getByRole('button', { name: '验收报告', exact: true }).click();
      await page.getByText('查看当前原始报告', { exact: true }).click();
      const report = JSON.parse(await page.getByRole('textbox', { name: '当前验收报告JSON' }).inputValue());
      if (mode === 'floating') {
        assert.ok(report.inputTrace.events.some(event => event.type === 'pointercancel'));
        assert.ok(report.inputTrace.events.some(event => event.type === 'pointerdown' && event.target === 'bomb'));
        assert.ok(report.inputTrace.events.some(event => event.type === 'input-state' && event.direction === 'right'));
        assert.equal(report.runs[0].eligibleSetup, false);
      } else assert.equal(report.inputTrace, undefined);
    } finally { await context.close(); }
  });
}

test('fullscreen button supports a prefixed browser API returning void', async () => {
  const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true });
  try {
    await context.addInitScript(() => {
      Object.defineProperty(Element.prototype, 'requestFullscreen', { configurable: true, value: undefined });
      Object.defineProperty(Document.prototype, 'exitFullscreen', { configurable: true, value: undefined });
      let active = null;
      Object.defineProperty(document, 'webkitFullscreenElement', { configurable: true, get: () => active });
      HTMLElement.prototype.webkitRequestFullscreen = function () { active = this; document.dispatchEvent(new Event('webkitfullscreenchange')); };
      document.webkitExitFullscreen = () => { active = null; document.dispatchEvent(new Event('webkitfullscreenchange')); };
    });
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    await page.goto(`${url}?arena=training`);
    await page.getByRole('button', { name: '开始游戏', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('canvas')?.dataset.flowPhase === 'playing');
    await page.getByRole('button', { name: '进入全屏', exact: true }).click();
    await page.getByRole('button', { name: '退出全屏', exact: true }).click();
    await page.getByRole('button', { name: '进入全屏', exact: true }).waitFor({ state: 'visible' });
  } finally { await context.close(); }
});

for (const failure of ['unsupported', 'rejected', 'event-rejected']) {
  test(`fullscreen ${failure}: visible feedback and diagnostic capabilities`, async () => {
    const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true });
    try {
      await context.addInitScript(failure => {
        for (const method of ['requestFullscreen', 'webkitRequestFullscreen']) Object.defineProperty(HTMLElement.prototype, method, { configurable: true, writable: true, value: undefined });
        Object.defineProperty(Document.prototype, 'exitFullscreen', { configurable: true, value: undefined });
        Object.defineProperty(document, 'webkitExitFullscreen', { configurable: true, writable: true, value: undefined });
        if (failure !== 'unsupported') {
          HTMLElement.prototype.webkitRequestFullscreen = failure === 'rejected'
            ? () => { throw new DOMException('Denied by test policy', 'NotAllowedError'); }
            : () => { setTimeout(() => document.dispatchEvent(new Event('webkitfullscreenerror')), 0); };
          document.webkitExitFullscreen = () => {};
        }
      }, failure);
      const page = await context.newPage();
      page.setDefaultTimeout(5000);
      await page.goto(`${url}?arena=training&acceptance=1`);
      await page.getByRole('button', { name: '返回游戏并记录', exact: true }).click();
      await page.getByRole('button', { name: '开始游戏', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('canvas')?.dataset.flowPhase === 'playing');
      await page.getByRole('button', { name: '进入全屏', exact: true }).click();
      await page.getByText(failure === 'unsupported' ? '当前浏览器环境未开放全屏，可收起地址栏后横屏游玩。' : '未能进入全屏，请重试；也可保持横屏游玩。', { exact: true }).waitFor({ state: 'visible' });
      await page.getByRole('button', { name: '暂停游戏', exact: true }).click();
      await page.getByRole('button', { name: '验收报告', exact: true }).click();
      await page.getByText('查看当前原始报告', { exact: true }).click();
      const report = JSON.parse(await page.getByRole('textbox', { name: '当前验收报告JSON' }).inputValue());
      assert.equal(report.fullscreen.prefixed, failure !== 'unsupported');
      assert.equal(report.fullscreen.standard, false);
      assert.equal(report.fullscreen.active, false);
      if (failure !== 'unsupported') assert.match(report.fullscreen.lastError, failure === 'rejected' ? /NotAllowedError/ : /fullscreenerror/);
      else assert.equal(report.fullscreen.lastError, null);
    } finally { await context.close(); }
  });
}
