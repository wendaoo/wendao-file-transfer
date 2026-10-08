import { ipcMain } from 'electron';
import { spawn, execFile } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { promisify } from 'util';
import { findAdb } from '../device-preview';
import { quote, remotePath, parseDirectory } from './protocol';
import thumbnail from './thumbnail';

const execute = promisify(execFile);
const sessions = new Map();
const active = new Set();
const success = (data) => ({ data, error: null, stderr: null });
const failure = (error) => ({
  data: null,
  error: error.message,
  stderr: `ADB: ${error.message}`,
});

async function localSize(file, directories) {
  const stat = await fs.lstat(file);

  if (stat.isSymbolicLink()) throw new Error('暂不支持传输符号链接');
  if (stat.isFile()) return stat.size;
  if (!stat.isDirectory()) throw new Error('不支持此文件类型');
  directories.push(file);
  const entries = await fs.readdir(file);
  const sizes = await Promise.all(
    entries.map((entry) => localSize(path.join(file, entry), directories))
  );

  return sizes.reduce((sum, size) => sum + size, 0);
}

async function transfer(sender, request, session, shell) {
  const { id, fileList, destination, direction } = request;
  const { adb, serial } = session;

  if (
    !['upload', 'download'].includes(direction) ||
    !Array.isArray(fileList) ||
    !fileList.length
  )
    throw new Error('传输参数无效');
  const upload = direction === 'upload';
  const target = upload ? remotePath(destination) : path.resolve(destination);

  if (upload) await shell(`test -d ${quote(target)}`);
  else if (!(await fs.stat(target)).isDirectory())
    throw new Error('下载目标不是文件夹');
  const sources = fileList.map((file) =>
    upload ? path.resolve(file) : remotePath(file, false)
  );
  const folders = sources.map(() => []);
  const sizes = await Promise.all(
    sources.map(async (file, index) => {
      if (upload) return localSize(file, folders[index]);
      folders[index] = (await shell(`find ${quote(file)} -type d -print0`))
        .split('\0')
        .filter(Boolean);
      const result = await shell(`du -sb ${quote(file)}`);
      const size = Number(result.match(/^\d+/)?.[0]);

      if (!Number.isFinite(size)) throw new Error('无法读取文件大小');

      return size;
    })
  );
  const total = sizes.reduce((sum, size) => sum + size, 0);
  let sent = 0;
  let child;
  let closed = false;
  const started = Date.now();
  const cleanup = () => {
    closed = true;
    child?.kill();
  };

  sender.once('destroyed', cleanup);
  const progress = (index, percentage, indeterminate) => {
    if (closed || sender.isDestroyed()) return;
    const bytes = Math.round((sizes[index] * percentage) / 100);

    sender.send('adb-files:progress', {
      id,
      currentFile: path.join(destination, path.basename(sources[index])),
      activeFileSize: sizes[index],
      activeFileSizeSent: bytes,
      activeFileProgress: percentage,
      totalFiles: sources.length,
      filesSent: index + (percentage === 100 ? 1 : 0),
      filesSentProgress: ((index + percentage / 100) / sources.length) * 100,
      totalFileSize: total,
      totalFileSizeSent: sent + bytes,
      totalFileProgress: total
        ? ((sent + bytes) / total) * 100
        : percentage === 100
        ? 100
        : 0,
      elapsedTime: `${((Date.now() - started) / 1000).toFixed(1)}s`,
      speed: '--',
      direction,
      indeterminate,
    });
  };

  try {
    for (let index = 0; index < sources.length; index += 1) {
      if (closed) throw new Error('传输窗口已关闭');
      progress(index, 0, true);
      const directories = folders[index].map((folder) =>
        path.join(
          target,
          path.basename(sources[index]),
          path.relative(sources[index], folder)
        )
      );

      if (upload && directories.length) {
        // ADB omits empty folders; create the directory tree explicitly.
        for (let offset = 0; offset < directories.length; offset += 100) {
          // eslint-disable-next-line no-await-in-loop
          await shell(
            `mkdir -p ${directories
              .slice(offset, offset + 100)
              .map(quote)
              .join(' ')}`
          );
        }
      } else if (!upload) {
        // eslint-disable-next-line no-await-in-loop
        await Promise.all(
          directories.map((directory) =>
            fs.mkdir(directory, { recursive: true })
          )
        );
      }

      // Pass the existing parent directory for both files and folders. ADB merges
      // a folder of the same name rather than adding a duplicate nesting level.
      // eslint-disable-next-line no-await-in-loop, no-loop-func
      await new Promise((resolve, reject) => {
        const process = spawn(adb, [
          '-s',
          serial,
          upload ? 'push' : 'pull',
          '-p',
          sources[index],
          `${target}/`,
        ]);

        child = process;
        let output = '';
        const read = (chunk) => {
          const text = chunk.toString();

          output = (output + text).slice(-3000);
          // The bracketed percentage is overall progress for this invocation;
          // a later percentage may refer only to one file inside a directory.
          const matches = [...text.matchAll(/\[\s*(\d+)%\]/g)];

          if (matches.length)
            progress(
              index,
              Math.min(99, Number(matches[matches.length - 1][1])),
              false
            );
        };

        process.stdout.on('data', read);
        process.stderr.on('data', read);
        process.once('error', reject);
        process.once('close', (code) =>
          code === 0
            ? resolve()
            : reject(new Error(output.trim() || 'ADB 文件传输失败'))
        );
      });
      progress(index, 100, false);
      sent += sizes[index];
    }
  } finally {
    sender.removeListener('destroyed', cleanup);
  }

  return success(true);
}

export function registerAdbFiles() {
  ipcMain.handle('adb-files:request', async ({ sender }, request) => {
    const { operation } = request;
    let locked = false;

    try {
      if (operation === 'connect') {
        if (active.has(sender.id)) throw new Error('已有文件正在传输');
        const adb = findAdb();

        if (!adb) {
          sessions.delete(sender.id);

          return success(null);
        }

        const { stdout } = await execute(adb, ['devices', '-l'], {
          timeout: 5000,
        });
        const devices = stdout
          .split('\n')
          .filter(
            (line) => /^\S+\s+device\s/.test(line) && line.includes('usb:')
          );

        if (!devices.length) {
          sessions.delete(sender.id);

          return success(null);
        }

        if (devices.length !== 1)
          throw new Error('检测到多台 Android 设备，请只连接需要管理的一台');
        const serial = devices[0].split(/\s/)[0];
        const { stdout: model } = await execute(
          adb,
          ['-s', serial, 'shell', 'getprop ro.product.model'],
          { timeout: 5000 }
        );

        await execute(
          adb,
          ['-s', serial, 'shell', 'test -r /sdcard && test -d /sdcard'],
          { timeout: 5000 }
        );
        if (!sessions.has(sender.id))
          sender.once('destroyed', () => sessions.delete(sender.id));
        sessions.set(sender.id, { adb, serial });

        return success({
          transport: 'adb',
          mtpDeviceInfo: { Model: model.trim(), SerialNumber: serial },
          usbDeviceInfo: { SerialNumber: serial, Product: model.trim() },
        });
      }

      const session = sessions.get(sender.id);

      if (!session) throw new Error('ADB 连接已断开，请刷新重新连接');
      const shell = async (command) => {
        const { stdout } = await execute(
          session.adb,
          ['-s', session.serial, 'shell', command],
          { timeout: 15000, maxBuffer: 32 * 1024 * 1024 }
        );

        return stdout;
      };

      if (operation === 'dispose') {
        sessions.delete(sender.id);

        return success(true);
      }

      if (operation === 'listStorages') {
        const output = await shell('df -k /sdcard');
        const fields = output.trim().split('\n').pop().trim().split(/\s+/);

        return success({
          65537: {
            name: '内部共享存储空间',
            selected: true,
            info: {
              StorageType: 3,
              StorageDescription: '内部共享存储空间',
              MaxCapability: Number(fields[1]) * 1024,
              FreeSpaceInBytes: Number(fields[3]) * 1024,
            },
          },
        });
      }

      if (request.storageId !== 65537)
        throw new Error('ADB 当前只支持内部共享存储空间');
      if (operation === 'thumbnail') {
        if (active.has(sender.id)) return success(null);

        return success(
          await thumbnail(
            session,
            request,
            () => !sender.isDestroyed() && sessions.get(sender.id) === session
          )
        );
      }

      if (operation === 'listFiles') {
        const directory = remotePath(request.filePath);
        const output = await shell(
          `cd ${quote(directory)} || exit 1; set --; for f in ${quote(
            directory
          )}/* ${quote(directory)}/.[!.]* ${quote(
            directory
          )}/..?*; do [ -e "$f" ] || continue; set -- "$@" "$f"; done; printf '%s\\0' "$@"; printf '\\0'; if [ "$#" -gt 0 ]; then stat -c '%f %s %Y' "$@"; fi`
        );

        return success(parseDirectory(output, request.ignoreHidden));
      }

      if (operation === 'filesExist') {
        const checks = request.fileList
          .map((file) => `[ -e ${quote(remotePath(file))} ] && printf '1'`)
          .join('; ');

        return success(Boolean(await shell(`${checks}; true`)));
      }

      if (active.has(sender.id)) throw new Error('已有文件正在传输');
      active.add(sender.id);
      locked = true;
      if (operation === 'transferFiles')
        return await transfer(sender, request, session, shell);
      if (operation === 'makeDirectory')
        await shell(`mkdir ${quote(remotePath(request.filePath, false))}`);
      else if (operation === 'renameFile') {
        if (
          !request.newFilename ||
          /[/\0]/.test(request.newFilename) ||
          ['.', '..'].includes(request.newFilename)
        )
          throw new Error('文件名无效');
        const source = remotePath(request.filePath, false);
        const target = path.posix.join(
          path.posix.dirname(source),
          request.newFilename
        );

        await shell(
          `test ! -e ${quote(target)} && mv ${quote(source)} ${quote(target)}`
        );
      } else if (operation === 'deleteFiles') {
        const files = request.fileList.map((file) =>
          quote(remotePath(file, false))
        );

        if (!files.length) throw new Error('未选择文件');
        await shell(`rm -rf ${files.join(' ')}`);
      } else throw new Error('不支持的设备操作');

      return success(true);
    } catch (error) {
      return failure(error);
    } finally {
      if (locked) active.delete(sender.id);
    }
  });
}
