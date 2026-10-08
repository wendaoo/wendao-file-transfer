const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const asar = require('asar');
const root = path.resolve(__dirname, '../..');
const pkg = require(path.join(root, 'package.json'));
const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';
const output = process.arch === 'arm64' ? 'mac-arm64' : 'mac';
const app = path.join(root, 'dist', output, `${pkg.productName}.app`);
const resources = path.join(app, 'Contents/Resources');
const archive = path.join(resources, 'app.asar');
assert(fs.existsSync(archive), `Missing packaged app: ${app}`);
const entries = new Set(asar.listPackage(archive));
for (const name of ['app/main.prod.js', 'app/app.html', 'app/dist/renderer.prod.js', 'app/services/mtp-worker.cjs']) {
  assert(entries.has(`/${name}`), `Missing ASAR entry: ${name}`);
}
for (const relative of [
  `bin/${arch}/kalam.dylib`, `bin/${arch}/libusb.dylib`, 'bin/mtp-cli',
  'bin/universal/device-drag.dylib', `ios/${arch}/bin/ios-files`,
  `ios/${arch}/bin/ios-photos`, `ios/${arch}/lib/libimobiledevice-1.0.dylib`,
  'adb/adb', 'adb/NOTICE.txt', 'hdc/hdc', 'hdc/libusb_shared.dylib',
  'mirror/scrcpy-server-v3.3.4', 'mirror/LICENSE.scrcpy',
]) {
  assert(fs.existsSync(path.join(resources, relative)), `Missing native resource: ${relative}`);
}
const mainText = asar.extractFile(archive, 'app/main.prod.js').toString();
assert(mainText.includes('local.wendao.filetransfer'), 'Expected wendao application identity');
const info = execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print :LSMinimumSystemVersion', path.join(app, 'Contents/Info.plist')], { encoding: 'utf8' }).trim();
assert.strictEqual(info, '13.0');
const dmg = fs.readdirSync(path.join(root, 'dist')).filter(n => n.endsWith('.dmg'));
assert(dmg.includes(`${pkg.name}-${pkg.version}-mac-${process.arch}.dmg`), 'Renamed DMG installer not generated');
const bundleName = execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleDisplayName', path.join(app, 'Contents/Info.plist')], { encoding: 'utf8' }).trim();
assert.strictEqual(bundleName, pkg.productName);
assert(asar.extractFile(archive, 'app/app.html').toString().includes(pkg.description), 'Missing requested subtitle');
console.log(`PASS: ${process.arch} packaged app, renderer, native resources, minimum OS and DMG`);
