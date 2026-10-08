// Read-only on the phone. One exported sample is checked in a temporary Mac folder, then removed.
require('@babel/register');
const assert = require('assert');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const { execFileSync } = require('child_process');
const { EventEmitter } = require('events');
const Module = require('module');
const original = Module._load;
const helper = path.resolve('build/ios', process.arch === 'arm64' ? 'arm64' : 'amd64', 'bin/ios-files');
Module._load = function(name, ...args) {
  if (name.endsWith('/helpers/binaries')) return { iosFilesPath: helper };
  return original.call(this, name, ...args);
};
(async () => {
  const { photoRequest, disposePhotos } = require('../../app/services/ios-files/photos');
  const connection = JSON.parse(execFileSync(helper, { input: JSON.stringify({ operation: 'connect' }), encoding: 'utf8' }));
  assert(!connection.error, connection.error);
  const serial = connection.data.usbDeviceInfo.SerialNumber;
  const sender = new EventEmitter(); sender.id = 9876;
  const destination = await fs.mkdtemp(path.join(os.tmpdir(), 'openmtp-photo-check-'));
  try {
    const rows = await photoRequest(sender, serial, { operation: 'listFiles', filePath: '/@photos' });
    assert(!rows.error, rows.error); assert(rows.data.length);
    assert.strictEqual(new Set(rows.data.map(f => f.path)).size, rows.data.length, 'Same-named media must have distinct identities');
    assert(rows.data.every(f => f.path.startsWith('/@photos/') && f.isPhoto && !f.isFolder));
    const sample = rows.data.filter(f => f.size > 0 && /\.(heic|jpe?g|png)$/i.test(f.name)).sort((a,b) => a.size-b.size)[0];
    assert(sample);
    const thumb = await photoRequest(sender, serial, { operation: 'thumbnail', filePath: sample.path });
    assert(!thumb.error, thumb.error); assert(thumb.data.startsWith('data:image/jpeg;base64,'));
    const invalid = await photoRequest(sender, serial, { operation: 'thumbnail', filePath: '/@photos/stale/invalid.jpg' });
    assert(invalid.error);
    for (const operation of ['deleteFiles', 'renameFile', 'makeDirectory'])
      assert((await photoRequest(sender, serial, { operation, filePath: sample.path, fileList: [sample.path] })).error);
    assert((await photoRequest(sender, serial, { operation: 'transferFiles', direction: 'upload', destination: '/@photos', fileList: ['/tmp/x'] })).error);
    const request = { operation: 'transferFiles', direction: 'download', fileList: [sample.path], destination };
    const result = await photoRequest(sender, serial, request);
    assert(!result.error, result.error);
    const bytes = await fs.readFile(path.join(destination, sample.name));
    assert(bytes.length > 0);
    assert((await photoRequest(sender, serial, request)).error);
    assert.deepStrictEqual(await fs.readFile(path.join(destination, sample.name)), bytes);
    assert(!(await fs.readdir(destination)).some(n => n.startsWith('.openmtp')));
    console.log(JSON.stringify({ pass: true, mediaCount: rows.data.length, thumbnailBytes: Buffer.from(thumb.data.split(',')[1], 'base64').length, exportedBytes: bytes.length, checks: ['catalog', 'thumbnail', 'stale item rejected', 'mutations rejected', 'download', 'conflict preserves original', 'staging cleanup'] }));
  } finally { disposePhotos(sender); await fs.rm(destination, {recursive:true,force:true}); Module._load = original; }
})().catch(e => { console.error(e); process.exitCode=1; });
