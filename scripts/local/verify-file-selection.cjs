// Integration check: running dev app on port 9226, with at least two files visible.
// Exercises selection only; does not modify device files.
const http = require('http');
const WebSocket = require('ws');
const assert = require('assert');
http.get('http://127.0.0.1:9226/json', (r) => {
  let body = '';
  r.on('data', (d) => (body += d));
  r.on('end', async () => {
    const page = JSON.parse(body).find((x) => x.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    let id = 0;
    const pending = new Map();
    ws.on('message', (d) => {
      const m = JSON.parse(d);
      if (pending.has(m.id)) {
        pending.get(m.id)(m);
        pending.delete(m.id);
      }
    });
    await new Promise((r) => ws.once('open', r));
    const call = (method, params) =>
      new Promise((r) => {
        const key = ++id;
        pending.set(key, r);
        ws.send(JSON.stringify({ id: key, method, params }));
      });
    const evaluate = async (expression) => {
      const m = await call('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (m.result.exceptionDetails)
        throw Error(JSON.stringify(m.result.exceptionDetails));
      return m.result.result.value;
    };
    const wait = () => new Promise((r) => setTimeout(r, 150));
    const mouse = async (type, x, y, modifiers = 0) => {
      await call('Input.dispatchMouseEvent', {
        type,
        x,
        y,
        button: type === 'mouseMoved' ? 'none' : 'left',
        buttons: type === 'mouseReleased' ? 0 : 1,
        clickCount: 1,
        modifiers,
      });
      await wait();
    };
    const selected = () =>
      evaluate(
        `Array.from(document.querySelectorAll('[data-file-path]')).filter(e=>e.querySelector('.Mui-checked')).map(e=>e.dataset.filePath)`
      );
    try {
      await evaluate(
        `(()=>{const b=document.querySelector('button[aria-label="切换为宫格视图"],button[aria-label="切换为网格视图"]');if(b)b.click();return true;})()`
      );
      await wait();
      const geometry = await evaluate(
        `(()=>{const el=document.querySelector('[id^="file-explorer-body-wrapper-"]');el.scrollTop=0;const body=el.querySelector('tbody').getBoundingClientRect();const first=el.querySelector('[data-file-path]').getBoundingClientRect();return {x:body.x+8,y:body.y+8,endX:first.x+180,endY:first.y+70,padding:getComputedStyle(el.querySelector('tbody td')).padding,borders:Array.from(document.querySelectorAll('[class*="DevicePreview-infoRow"],[class*="DevicePreview-storage-"]')).map(e=>getComputedStyle(e).borderWidth)};})()`
      );
      await mouse('mousePressed', geometry.x, geometry.y);
      await mouse('mouseMoved', geometry.endX, geometry.endY);
      await mouse('mouseReleased', geometry.endX, geometry.endY);
      const gridSelected = await selected();
      assert.strictEqual(gridSelected.length, 2);
      await mouse('mousePressed', geometry.x, geometry.y);
      await mouse('mouseReleased', geometry.x, geometry.y);
      assert.strictEqual((await selected()).length, 0);
      assert.strictEqual(geometry.padding, '24px');
      assert(geometry.borders.every((x) => x === '0px'));
      await mouse('mousePressed', geometry.x, geometry.y);
      await mouse('mouseMoved', geometry.endX - 112, geometry.endY);
      await mouse('mouseReleased', geometry.endX - 112, geometry.endY);
      assert.strictEqual((await selected()).length, 1);
      await mouse('mousePressed', geometry.x + 144, geometry.y, 4);
      await mouse('mouseMoved', geometry.endX, geometry.endY, 4);
      await mouse('mouseReleased', geometry.endX, geometry.endY, 4);
      assert.strictEqual((await selected()).length, 2);
      await mouse('mousePressed', geometry.x, geometry.y);
      await mouse('mouseMoved', geometry.endX - 112, geometry.endY);
      assert.strictEqual((await selected()).length, 1);
      await call('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'Escape',
        code: 'Escape',
        windowsVirtualKeyCode: 27,
      });
      await wait();
      assert.strictEqual((await selected()).length, 2);
      await mouse('mouseReleased', geometry.endX - 112, geometry.endY);
      await mouse('mousePressed', geometry.x, geometry.y);
      await mouse('mouseReleased', geometry.x, geometry.y);
      assert.strictEqual((await selected()).length, 0);
      console.log('Command append and Escape restore passed.');
    } catch (e) {
      console.error(e);
      process.exitCode = 1;
    } finally {
      ws.close();
    }
  });
});
