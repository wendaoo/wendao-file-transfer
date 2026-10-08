require('@babel/register');
const assert = require('assert');
const Module = require('module');
const originalLoad = Module._load;
const realFs = require('fs');
const calls = [];
let devices = 'List of devices attached\nphone-a\tdevice\nphone-b\tdevice\n';
let output = 'Success\n';
let failure;
let release;
let hold = false;
Module._load = function(request, ...args) {
  if (request === 'child_process') return { execFile(binary, argv, options, callback) {
    calls.push({binary, argv, options});
    if (argv[0] === 'devices') return callback(null, devices, '');
    if (hold) { release = () => callback(null, output, ''); return; }
    callback(failure, output, '');
  }};
  if (request === 'util') return { ...require('node:util'), promisify: fn => (...params) => new Promise((resolve, reject) => fn(...params, (err, stdout, stderr) => err ? reject(err) : resolve({stdout, stderr}))) };
  if (request === 'fs') return { ...realFs, promises: { ...realFs.promises, stat: async p => ({ isFile: () => !p.includes('folder'), size: p.includes('empty') ? 0 : 123 }) } };
  return originalLoad.call(this, request, ...args);
};
const install = require('../../app/services/device-preview/installApk').default;
Module._load = originalLoad;
(async () => {
  const file = '/tmp/中文 app $(touch nope).APK';
  assert.deepStrictEqual(await install('/adb', 'phone-b', file), {name: '中文 app $(touch nope).APK'});
  assert.deepStrictEqual(calls[1].argv, ['-s', 'phone-b', 'install', '-r', file]);
  assert.strictEqual(calls[1].options.timeout, 300000);
  for (const p of ['/tmp/file.txt', 'relative.apk', '/tmp/folder.apk', '/tmp/empty.apk'])
    await assert.rejects(install('/adb', 'phone-b', p));
  await assert.rejects(install(null, 'phone-b', file), /未找到 ADB/);
  await assert.rejects(install('/adb', '', file), /请先连接/);
  devices = 'phone-b\tunauthorized\n';
  await assert.rejects(install('/adb', 'phone-b', file), /允许 USB 调试/);
  devices = 'phone-a\tdevice\n';
  await assert.rejects(install('/adb', 'phone-b', file), /未连接或已离线/);
  devices = 'phone-b\tdevice\n';
  output = 'Failure [INSTALL_FAILED_UPDATE_INCOMPATIBLE]';
  await assert.rejects(install('/adb', 'phone-b', file), /UPDATE_INCOMPATIBLE/);
  output = '';
  await assert.rejects(install('/adb', 'phone-b', file), /未返回安装成功/);
  failure = Object.assign(new Error('timeout'), {killed: true});
  await assert.rejects(install('/adb', 'phone-b', file), /安装超时/);
  failure = null; output = 'Success\n'; hold = true;
  const pending = install('/adb', 'phone-b', file);
  await new Promise(setImmediate);
  await assert.rejects(install('/adb', 'phone-b', file), /正在安装/);
  release(); await pending; hold = false;
  await install('/adb', 'phone-b', file);
  console.log('APK install: device targeting, literal paths, validation, authorization, failure, timeout and concurrency passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
