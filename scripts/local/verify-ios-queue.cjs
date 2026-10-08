require('@babel/register');
const assert = require('assert');
const Module = require('module');
const { EventEmitter } = require('events');
const original = Module._load;
let handler, running = 0, maximum = 0;
const requests = [];
Module._load = function(name, ...args) {
  if (name === 'electron') return { ipcMain: { on: () => {}, handle: (_channel, fn) => { handler = fn; } } };
  if (name.endsWith('/helpers/binaries')) return { iosFilesPath: __filename };
  if (name === 'child_process') return { spawn: () => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter(); child.stdout.setEncoding = () => {};
    child.stderr = new EventEmitter(); child.stdin = new EventEmitter();
    child.kill = () => child.emit('close', 1);
    child.stdin.end = text => {
      const request = JSON.parse(text); requests.push(request);
      maximum = Math.max(maximum, ++running);
      setTimeout(() => {
        const result = request.operation === 'connect'
          ? { data: { transport: 'ios', usbDeviceInfo: { SerialNumber: 'test-phone' } }, error: null }
          : { data: ['中文文件'], error: null };
        const line = JSON.stringify(result) + '\n';
        child.stdout.emit('data', line.slice(0, 10));
        child.stdout.emit('data', line.slice(10));
        --running; child.emit('close', request.filePath === '/failed-exit' ? 1 : 0);
      }, 15);
    };
    return child;
  } };
  return original.call(this, name, ...args);
};
(async () => {
  const { registerIosFiles } = require('../../app/services/ios-files');
  registerIosFiles();
  const sender = new EventEmitter(); sender.id = 7; sender.isDestroyed = () => false; sender.send = () => {};
  const invoke = request => handler({ sender }, request);
  assert.strictEqual((await invoke({ operation: 'connect' })).error, null);
  const results = await Promise.all([
    invoke({ operation: 'listFiles', filePath: '/', serial: 'spoofed' }),
    invoke({ operation: 'filesExist', fileList: ['/app/x'] }),
    invoke({ operation: 'transferFiles', fileList: ['/app/x'], destination: '/tmp', direction: 'download' }),
  ]);
  assert(results.every(r => !r.error));
  assert.strictEqual(maximum, 1);
  assert(requests.slice(1).every(r => r.serial === 'test-phone'));
  assert.strictEqual(results[0].data[0].path, '/@photos');
  assert.deepStrictEqual(results[0].data.slice(1), ['中文文件']);
  const failed = await invoke({ operation: 'listFiles', filePath: '/failed-exit' });
  assert(failed.error); // A result line followed by nonzero exit is not success.
  assert((await invoke({ operation: 'arbitrary-command' })).error);
  await invoke({ operation: 'dispose' });
  assert((await invoke({ operation: 'listFiles', filePath: '/' })).error);
  assert.strictEqual(sender.listenerCount('destroyed'), 1); // Session lifetime only, no per-request leak.
  console.log('PASS: serialized refresh/check/transfer, bound device identity, chunked UTF-8 protocol, failed-exit rejection, dispose and listener cleanup');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => { Module._load = original; });
