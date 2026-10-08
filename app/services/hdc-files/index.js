/* eslint no-await-in-loop: off */
import { ipcMain, nativeImage } from 'electron';
import { execFile, spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import { promisify } from 'util';
import { findHdc } from '../device-preview';
import { quote } from '../adb-files/protocol';

const execute = promisify(execFile);
const sessions = new Map();
const active = new Set();
const storageId = 65537;
const marker = '__OPENMTP_HDC_EXIT__';
const thumbnailCache = new Map();
const thumbnailPending = new Map();
const thumbnailWaiting = [];
const maxThumbnailBytes = 100 * 1024 * 1024;
let thumbnailsRunning = 0;
const success = (data) => ({ data, error: null, stderr: null });
const failure = (error) => ({
  data: null,
  error: error.message,
  stderr: `HDC: ${error.message}`,
});

async function shell(session, script, timeout = 20000) {
  const command = `${script}; code=$?; printf '\n${marker}%s' "$code"`;
  const { stdout, stderr } = await execute(
    session.hdc,
    ['-t', session.serial, 'shell', command],
    { timeout, maxBuffer: 32 * 1024 * 1024 }
  );
  const split = stdout.lastIndexOf(`\n${marker}`);

  if (split < 0) throw new Error(stderr.trim() || '设备没有返回完整响应');
  const output = stdout.slice(0, split);
  const code = Number(stdout.slice(split + marker.length + 1).trim());

  if (code !== 0)
    throw new Error(output.trim() || stderr.trim() || '设备命令执行失败');

  return output.replace(/\n$/, '');
}

function remotePath(session, value, allowRoot = true) {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.includes('\0') ||
    value.split('/').includes('..')
  )
    throw new Error('设备路径无效');
  const normalized = path.posix.normalize(value);

  if (!allowRoot && normalized === '/') throw new Error('不能修改媒体库根目录');

  return path.posix.join(session.root, normalized.slice(1));
}

function relativePath(session, absolute) {
  if (!absolute.startsWith(`${session.root}/`))
    throw new Error('设备返回了媒体库之外的路径');

  return absolute.slice(session.root.length);
}

function parseDirectory(session, output, ignoreHidden, directory) {
  const separator = output.indexOf('\n');

  if (separator < 0) throw new Error('HDC 目录数据不完整');
  const encodedPaths = output.slice(0, separator);

  if (!/^[a-z0-9+/]*={0,2}$/i.test(encodedPaths))
    throw new Error('HDC 目录数据格式无效');
  const paths = Buffer.from(encodedPaths, 'base64')
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
  const stats = output
    .slice(separator + 1)
    .trim()
    .split('\n')
    .filter(Boolean);

  if (paths.length !== stats.length) throw new Error('HDC 目录数据不完整');

  return paths
    .map((absolute, index) => {
      const match = stats[index].match(/^([0-9a-f]+) (\d+) (\d+)$/i);

      if (!match) throw new Error('HDC 目录属性格式无效');
      if (path.posix.dirname(absolute) !== directory)
        throw new Error('HDC 目录数据路径无效');
      const name = path.posix.basename(absolute);
      const type = Math.floor(parseInt(match[1], 16) / 4096) * 4096;

      if (
        (ignoreHidden && name.startsWith('.')) ||
        ![0x4000, 0x8000].includes(type)
      )
        return null;

      return {
        name,
        path: relativePath(session, absolute),
        size: Number(match[2]),
        isFolder: type === 0x4000,
        dateAdded: new Date(Number(match[3]) * 1000).toISOString(),
      };
    })
    .filter(Boolean);
}

async function runFileTransfer(session, sender, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(session.hdc, ['-t', session.serial, 'file', ...args]);
    let output = '';
    const read = (chunk) => {
      output = (output + chunk.toString()).slice(-4000);
    };
    const cancel = () => child.kill();

    child.stdout.on('data', read);
    child.stderr.on('data', read);
    sender.once('destroyed', cancel);
    child.once('error', reject);
    child.once('close', (code) => {
      sender.removeListener('destroyed', cancel);
      if (code === 0 && /FileTransfer finish/.test(output)) resolve();
      else reject(new Error(output.trim() || 'HDC 文件传输失败'));
    });
  });
}

async function receiveMediaThumbnail(session, sender, remote, file) {
  const name = path.posix.basename(remote);
  const output = await shell(
    session,
    `mediatool query ${quote(name)} -u`,
    15000
  );
  const candidates = output
    .split('\n')
    .filter((line) => line.startsWith('"file://media/Photo/'))
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (_) {
        return null;
      }
    })
    .filter(
      (uri) =>
        typeof uri === 'string' &&
        uri.startsWith('file://media/Photo/') &&
        path.posix.basename(uri) === name
    )
    .sort((left, right) => {
      const leftId = Number(left.match(/^file:\/\/media\/Photo\/(\d+)\//)?.[1]);
      const rightId = Number(
        right.match(/^file:\/\/media\/Photo\/(\d+)\//)?.[1]
      );

      return rightId - leftId;
    });
  const deviceFile = `/data/local/tmp/openmtp-hdc-thumbnail-${randomBytes(
    12
  ).toString('hex')}${path.extname(remote)}`;

  try {
    for (const uri of candidates) {
      try {
        // Media FUSE can list shared images while rejecting direct file reads.
        // The newest media record is normally the copy visible in ShareMedia.
        // eslint-disable-next-line no-await-in-loop
        const size = Number(
          await shell(
            session,
            `mediatool recv ${quote(uri)} ${quote(
              deviceFile
            )} >/dev/null 2>&1 && stat -c %s ${quote(deviceFile)}`,
            30000
          )
        );

        if (Number.isFinite(size) && size > 0) {
          if (size > maxThumbnailBytes) return false;
          // eslint-disable-next-line no-await-in-loop
          await runFileTransfer(session, sender, ['recv', deviceFile, file]);

          return true;
        }
      } catch (_) {
        // eslint-disable-next-line no-await-in-loop
        await shell(session, `rm -f ${quote(deviceFile)}`, 5000).catch(
          () => {}
        );
      }
    }

    return false;
  } finally {
    await shell(session, `rm -f ${quote(deviceFile)}`, 5000).catch(() => {});
  }
}

async function readThumbnail(session, sender, request) {
  const remote = remotePath(session, request.filePath, false);
  const file = path.join(
    tmpdir(),
    `openmtp-hdc-thumbnail-${randomBytes(12).toString('hex')}${path.extname(
      remote
    )}`
  );
  const jpeg = `${file}.jpg`;

  try {
    let received = false;

    if (request.size > 0) {
      try {
        await runFileTransfer(session, sender, ['recv', remote, file]);
        received = true;
      } catch (_) {
        await fs.unlink(file).catch(() => {});
      }
    }

    if (!received)
      received = await receiveMediaThumbnail(session, sender, remote, file);
    if (!received) return null;
    if ((await fs.stat(file)).size > maxThumbnailBytes) return null;
    let image;

    try {
      await execute(
        '/usr/bin/sips',
        ['-Z', '160', '-s', 'format', 'jpeg', file, '--out', jpeg],
        { timeout: 15000 }
      );
      image = nativeImage.createFromPath(jpeg);
    } catch (_) {
      image = nativeImage.createFromPath(file);
    }

    if (image.isEmpty()) image = nativeImage.createFromPath(file);
    if (image.isEmpty()) return null;
    const { width, height } = image.getSize();
    const scale = Math.min(1, 160 / Math.max(width, height));

    return image
      .resize({
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
      })
      .toDataURL();
  } finally {
    await Promise.all([
      fs.unlink(file).catch(() => {}),
      fs.unlink(jpeg).catch(() => {}),
    ]);
  }
}

async function thumbnail(session, sender, request) {
  if (
    request.serial !== session.serial ||
    !/\.(png|jpe?g|gif|webp|bmp|heic|heif|avif)$/i.test(request.filePath) ||
    !Number.isFinite(request.size) ||
    request.size < 0 ||
    request.size > maxThumbnailBytes
  )
    return null;
  remotePath(session, request.filePath, false);
  const key = JSON.stringify([
    session.serial,
    request.filePath,
    request.size,
    request.dateAdded,
  ]);

  if (thumbnailCache.has(key)) return thumbnailCache.get(key);
  if (thumbnailPending.has(key)) return thumbnailPending.get(key);
  if (thumbnailWaiting.length >= 128) return null;
  const task = (async () => {
    if (thumbnailsRunning >= 2)
      await new Promise((resolve) => thumbnailWaiting.push(resolve));
    else thumbnailsRunning += 1;

    try {
      if (sender.isDestroyed() || sessions.get(sender.id) !== session)
        return null;
      const data = await readThumbnail(session, sender, request);

      if (sender.isDestroyed() || sessions.get(sender.id) !== session)
        return null;
      thumbnailCache.set(key, data);
      if (thumbnailCache.size > 128)
        thumbnailCache.delete(thumbnailCache.keys().next().value);

      return data;
    } catch (_) {
      return null;
    } finally {
      const next = thumbnailWaiting.shift();

      if (next) next();
      else thumbnailsRunning -= 1;
    }
  })();

  thumbnailPending.set(key, task);
  try {
    return await task;
  } finally {
    thumbnailPending.delete(key);
  }
}

async function transfer(sender, request, session) {
  const { id, fileList, destination, direction } = request;

  if (
    !['upload', 'download'].includes(direction) ||
    !Array.isArray(fileList) ||
    !fileList.length
  )
    throw new Error('传输参数无效');
  const upload = direction === 'upload';
  const target = upload
    ? remotePath(session, destination)
    : path.resolve(destination);

  if (upload) {
    if (destination === '/')
      throw new Error('请先打开一个相册，再导入照片或视频');
    await shell(session, `test -d ${quote(target)}`);
  } else if (!(await fs.stat(target)).isDirectory())
    throw new Error('下载目标不是文件夹');

  const sources = fileList.map((file) =>
    upload ? path.resolve(file) : remotePath(session, file, false)
  );
  const started = Date.now();
  const progress = (index, size, percentage) => {
    if (sender.isDestroyed()) return;
    const sent = Math.round((size * percentage) / 100);

    sender.send('hdc-files:progress', {
      id,
      currentFile: fileList[index],
      activeFileSize: size,
      activeFileSizeSent: sent,
      activeFileProgress: percentage,
      totalFiles: sources.length,
      filesSent: index + (percentage === 100 ? 1 : 0),
      filesSentProgress: ((index + percentage / 100) / sources.length) * 100,
      totalFileSize: 0,
      totalFileSizeSent: 0,
      totalFileProgress: ((index + percentage / 100) / sources.length) * 100,
      elapsedTime: `${((Date.now() - started) / 1000).toFixed(1)}s`,
      speed: '--',
      direction,
      indeterminate: percentage === 0,
    });
  };

  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index];
    const name = upload ? path.basename(source) : path.posix.basename(source);
    const destinationFile = upload
      ? path.posix.join(target, name)
      : path.join(target, name);
    let size = 0;

    if (upload) {
      // Media FUSE accepts files in existing albums, but not new directories.
      const stat = await fs.lstat(source);

      if (!stat.isFile() || stat.isSymbolicLink())
        throw new Error('HDC 媒体目录目前只支持导入照片或视频文件');
      size = stat.size;
      await shell(session, `test ! -e ${quote(destinationFile)}`);
    } else {
      const metadata = await shell(session, `stat -c '%f %s' ${quote(source)}`);
      const match = metadata.match(/^([0-9a-f]+) (\d+)$/i);

      if (!match || Math.floor(parseInt(match[1], 16) / 4096) * 4096 !== 0x8000)
        throw new Error('HDC 媒体目录目前只支持导出单个文件');
      size = Number(match[2]);
      try {
        await fs.lstat(destinationFile);
        throw new Error('本地目标已存在同名文件');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }

    progress(index, size, 0);
    // eslint-disable-next-line no-await-in-loop
    await runFileTransfer(
      session,
      sender,
      upload
        ? ['send', source, destinationFile]
        : ['recv', source, destinationFile]
    );
    progress(index, size, 100);
  }

  return success(true);
}

export function registerHdcFiles() {
  ipcMain.handle('hdc-files:request', async ({ sender }, request) => {
    const { operation } = request;
    let locked = false;

    try {
      if (operation === 'connect') {
        if (active.has(sender.id)) throw new Error('已有文件正在传输');
        const hdc = findHdc();

        if (!hdc) return success(null);
        const { stdout } = await execute(hdc, ['list', 'targets', '-v'], {
          timeout: 6000,
        });
        const devices = stdout
          .split('\n')
          .filter((line) => /^\S+\s+USB\s+Connected\b/.test(line));

        if (!devices.length) return success(null);
        if (devices.length !== 1)
          throw new Error('检测到多台鸿蒙设备，请只连接需要管理的一台');
        const serial = devices[0].trim().split(/\s+/)[0];
        const session = { hdc, serial };
        const roots = await shell(
          session,
          'for d in /mnt/data/[0-9]*/media_fuse/Photo; do if [ -d "$d" ] && [ -r "$d" ]; then printf "%s\\n" "$d"; fi; done; true'
        );
        const root = roots
          .split('\n')
          .find((line) => /^\/mnt\/data\/\d+\/media_fuse\/Photo$/.test(line));

        if (!root) return success(null);
        const model = (
          await shell(session, 'param get const.product.model')
        ).trim();

        session.root = root;
        if (!sessions.has(sender.id))
          sender.once('destroyed', () => sessions.delete(sender.id));
        sessions.set(sender.id, session);

        return success({
          transport: 'hdc',
          mediaOnly: true,
          mtpDeviceInfo: { Model: model, SerialNumber: serial },
          usbDeviceInfo: { SerialNumber: serial, Product: model },
        });
      }

      const session = sessions.get(sender.id);

      if (!session) throw new Error('HDC 连接已断开，请刷新重新连接');
      if (operation === 'dispose') {
        sessions.delete(sender.id);

        return success(true);
      }

      if (operation === 'listStorages')
        return success({
          [storageId]: {
            name: '照片与视频',
            selected: true,
            info: {
              StorageType: 3,
              StorageDescription: '照片与视频',
              MaxCapability: 0,
              FreeSpaceInBytes: 0,
            },
          },
        });

      if (request.storageId !== storageId)
        throw new Error('HDC 当前只支持照片与视频目录');
      if (operation === 'thumbnail') {
        if (active.has(sender.id)) return success(null);

        return success(await thumbnail(session, sender, request));
      }

      if (operation === 'listFiles') {
        const directory = remotePath(session, request.filePath);
        const output = await shell(
          session,
          `d=${quote(
            directory
          )}; if [ ! -d "$d" ]; then false; else set --; for f in "$d"/* "$d"/.[!.]* "$d"/..?*; do [ -e "$f" ] || continue; set -- "$@" "$f"; done; printf '%s\\0' "$@" | base64 -w 0; printf '\\n'; if [ "$#" -gt 0 ]; then printf '%s\\0' "$@" | xargs -0 -r -n 128 stat -c '%f %s %Y'; fi; fi`,
          30000
        );

        return success(
          parseDirectory(session, output, request.ignoreHidden, directory)
        );
      }

      if (operation === 'filesExist') {
        const checks = request.fileList
          .map(
            (file) => `[ -e ${quote(remotePath(session, file))} ] && printf '1'`
          )
          .join('; ');

        return success(Boolean(await shell(session, `${checks}; true`)));
      }

      if (active.has(sender.id)) throw new Error('已有文件正在传输');
      active.add(sender.id);
      locked = true;
      if (operation === 'transferFiles')
        return await transfer(sender, request, session);
      if (operation === 'makeDirectory')
        throw new Error('HDC 媒体库不支持新建相册目录');
      if (operation === 'renameFile') {
        if (
          !request.newFilename ||
          /[/\0]/.test(request.newFilename) ||
          ['.', '..'].includes(request.newFilename)
        )
          throw new Error('文件名无效');
        const source = remotePath(session, request.filePath, false);
        const target = path.posix.join(
          path.posix.dirname(source),
          request.newFilename
        );

        await shell(
          session,
          `test -f ${quote(source)} && test ! -e ${quote(target)} && mv ${quote(
            source
          )} ${quote(target)}`
        );
      } else if (operation === 'deleteFiles') {
        if (!request.fileList.length) throw new Error('未选择文件');
        const files = request.fileList.map((file) =>
          remotePath(session, file, false)
        );

        await shell(
          session,
          `for f in ${files
            .map(quote)
            .join(' ')}; do [ -f "$f" ] || exit 1; done; rm -f ${files
            .map(quote)
            .join(' ')}`
        );
      } else throw new Error('不支持的设备操作');

      return success(true);
    } catch (error) {
      return failure(error);
    } finally {
      if (locked) active.delete(sender.id);
    }
  });
}
