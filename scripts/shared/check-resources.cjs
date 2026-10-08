const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = path.resolve(__dirname, '../..');
const manifest = require('./native-resources.json');
const failures = [];
// Some ZIP extractors expose Git symlinks as small text files. Restore only
// the exact, recorded relative link, never an arbitrary target.
for (const entry of manifest.symlinks || []) {
  const file = path.join(root, entry.path);
  const resolved = path.resolve(path.dirname(file), entry.target);
  if (!resolved.startsWith(`${root}${path.sep}`) || !fs.existsSync(resolved)) {
    failures.push(`Invalid native link target: ${entry.path}`);
    continue;
  }
  try {
    if (fs.lstatSync(file).isSymbolicLink()) {
      if (fs.readlinkSync(file) !== entry.target) failures.push(`Wrong link: ${entry.path}`);
    } else if (fs.readFileSync(file, 'utf8').trim() === entry.target) {
      fs.unlinkSync(file);
      fs.symlinkSync(entry.target, file);
    } else {
      failures.push(`Expected native symlink: ${entry.path}`);
    }
  } catch {
    failures.push(`Missing native symlink: ${entry.path}`);
  }
}
for (const entry of manifest.files) {
  const file = path.join(root, entry.path);
  if (!fs.existsSync(file)) {
    failures.push(`Missing: ${entry.path}`);
  } else if (crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== entry.sha256) {
    failures.push(`Checksum mismatch: ${entry.path}`);
  } else if (entry.executable) {
    fs.chmodSync(file, 0o755);
  }
}
// Restore executable permissions when a ZIP exporter drops mode bits.
for (const relative of ['tools/adb/adb', 'tools/hdc/hdc_arm64', 'tools/hdc/hdc_x86_64', 'build/mac/bin/mtp-cli']) {
  const file = path.join(root, relative);
  if (fs.existsSync(file)) fs.chmodSync(file, 0o755);
}
if (failures.length) {
  console.error(failures.join('\n'));
  console.error('Obtain missing HDC tools from the official SDK as described in tools/hdc/README.md; other native resources are checked in.');
  process.exit(1);
}
// Both HDC executables load the generic library name through @rpath.
// Recreate the local links for the Node architecture instead of shipping
// the original Intel-only links to every collaborator.
const hdcArch = process.arch === 'arm64' ? 'arm64' : 'x86_64';
for (const [name, target] of [
  ['hdc', `hdc_${hdcArch}`],
  ['libusb_shared.dylib', `libusb_shared_${hdcArch}.dylib`],
]) {
  const link = path.join(root, 'tools/hdc', name);
  let stat;
  try {
    stat = fs.lstatSync(link);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (stat) {
    if (!stat.isSymbolicLink()) {
      throw new Error(`Expected a generated symlink: ${link}`);
    }
    fs.unlinkSync(link);
  }
  fs.symlinkSync(target, link);
}
console.log(`Native resources verified: ${manifest.files.length} files`);
