import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';
import { createServer } from 'vite';

let server, browser, url;
before(async () => {
  server = await createServer({ server: { host: '127.0.0.1', port: 0, strictPort: true } });
  await server.listen();
  url = server.resolvedUrls.local[0];
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
});
after(async () => { await browser?.close(); await server?.close(); });

for (const mode of ['floating', 'fixed']) {
  test(`${mode}: right-hand bomb press/release preserves held left-hand movement`, async () => {
    const context = await browser.newContext({ viewport: { width: 960, height: 400 }, hasTouch: true, isMobile: true });
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(5000);
      await page.goto(`${url}?arena=training&acceptance=1${mode === 'floating' ? '&touchTrace=1' : ''}`);
      await page.getByRole('button', { name: '返回游戏并记录', exact: true }).click();
      await page.getByRole('button', { name: '打开设置', exact: true }).click();
      await page.getByRole('radio', { name: mode === 'floating' ? '浮动摇杆' : '固定摇杆', exact: true }).check();
      await page.getByRole('button', { name: '完成', exact: true }).click();
      await page.getByRole('button', { name: '开始游戏', exact: true }).click();
      const canvas = page.locator('canvas');
      await page.waitForFunction(() => document.querySelector('canvas')?.dataset.phase === 'playing');
      const bounds = await canvas.boundingBox();
      const layout = JSON.parse(await canvas.getAttribute('data-viewport-layout'));
      const left = { id: 1, x: bounds.x + layout.joystick.x, y: bounds.y + layout.joystick.y };
      const right = { id: 2, x: bounds.x + layout.bomb.x, y: bounds.y + layout.bomb.y };
      const cdp = await context.newCDPSession(page);
      const touch = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
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
      await touch('touchStart', [left, right]);
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
      await touch('touchStart', [left, right]);
      await page.waitForFunction(() => document.querySelector('.bomb-control')?.classList.contains('held'));
      await touch('touchCancel', []);
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
