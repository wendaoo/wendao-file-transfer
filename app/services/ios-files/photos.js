/* eslint-disable no-await-in-loop, no-continue */
// Camera downloads are intentionally sequential; never race destination commits.
import path from 'path';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { iosFilesPath } from '../../helpers/binaries';

export const PHOTO_ROOT = '/@photos';
export const isPhotoPath = (value) =>
  typeof value === 'string' &&
  (value === PHOTO_ROOT || value.startsWith(`${PHOTO_ROOT}/`));
const clients = new Map();
const CATALOG_TIMEOUT = '照片目录未就绪，请解锁 iPhone 并刷新重试';
const success = (data) => ({ data, error: null, stderr: null });
const failure = (message) => ({
  data: null,
  error: `照片：${message}`,
  stderr: `iOS: 照片：${message}`,
});

export function disposePhotos(sender) {
  clients.get(sender.id)?.stop();
}

function clientFor(sender, serial) {
  let client = clients.get(sender.id);

  if (client?.serial === serial) return client;
  client?.stop();
  const child = spawn(path.join(path.dirname(iosFilesPath), 'ios-photos'), [
    serial,
  ]);
  const pending = new Map();
  let sequence = 0;
  let buffer = '';
  let closed = false;
  const stop = (reason = '连接已关闭，请刷新照片列表') => {
    if (closed) return;
    closed = true;
    child.kill();
    sender.removeListener('destroyed', stop);
    if (clients.get(sender.id) === client) clients.delete(sender.id);
    pending.forEach(({ resolve, timer }) => {
      clearTimeout(timer);
      resolve(failure(reason));
    });
    pending.clear();
  };

  client = {
    serial,
    stop,
    cache: new Map(),
    request(request, onProgress = () => {}, timeoutMs = 90000) {
      return new Promise((resolve) => {
        if (closed) {
          resolve(failure('连接已关闭，请刷新照片列表'));

          return;
        }

        sequence += 1;
        const id = String(sequence);
        const entry = { resolve, onProgress };
        const touch = () => {
          clearTimeout(entry.timer);
          entry.timer = setTimeout(
            () =>
              stop(
                request.operation === 'listFiles'
                  ? CATALOG_TIMEOUT
                  : '读取超时，请解锁 iPhone 并信任此电脑，再刷新重试'
              ),
            timeoutMs
          );
        };

        entry.touch = touch;
        pending.set(id, entry);
        touch();
        child.stdin.write(`${JSON.stringify({ ...request, id })}\n`);
      });
    },
  };
  clients.set(sender.id, client);
  sender.once('destroyed', stop);
  child.once('error', () => stop('无法启动照片组件，请重新构建应用'));
  child.once('close', () => stop());
  child.stdin.on('error', () => stop());
  child.stderr.resume();
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    if (buffer.length > 32 * 1024 * 1024) {
      stop('照片组件返回的数据过大');

      return;
    }

    let boundary;

    // eslint-disable-next-line no-cond-assign
    while ((boundary = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, boundary);

      buffer = buffer.slice(boundary + 1);
      try {
        const result = JSON.parse(line);
        const entry = pending.get(result.id);

        if (entry) {
          if (typeof result.progress === 'number') {
            if (
              entry.lastProgress === undefined ||
              result.progress > entry.lastProgress
            )
              entry.touch();
            entry.lastProgress = result.progress;
            entry.onProgress(result.progress);
          } else {
            clearTimeout(entry.timer);
            pending.delete(result.id);
            entry.resolve(
              result.error ? failure(result.error) : success(result.data)
            );
          }
        }
      } catch (_) {
        stop('照片组件返回了无效数据');
      }
    }
  });

  return client;
}

export async function photoRequest(sender, serial, request, onProgress) {
  const { operation, filePath, fileList, destination, direction } = request;

  if (operation === 'filesExist') return success(false);
  if (
    !['listFiles', 'thumbnail', 'transferFiles'].includes(operation) ||
    (operation === 'transferFiles' && direction !== 'download')
  )
    return failure('照片仅支持浏览和导出到 Mac，不能在此上传、重命名或删除');
  if (operation === 'listFiles' && filePath !== PHOTO_ROOT)
    return failure('目录不存在，请返回照片与视频');

  const client = clientFor(sender, serial);

  if (operation === 'listFiles') {
    client.cache.clear();

    const first = await client.request({ operation }, undefined, 15000);

    if (
      first.error !== `照片：${CATALOG_TIMEOUT}` &&
      !first.error?.startsWith('照片：无法打开 iPhone 照片会话：')
    )
      return first;

    // ImageCaptureCore can miss the initial ready event after a transient
    // session failure. Open a fresh session once before reporting the error.
    client.stop();

    return clientFor(sender, serial).request({ operation }, undefined, 15000);
  }

  if (operation === 'thumbnail') {
    if (client.cache.has(filePath)) return client.cache.get(filePath);
    const result = await client.request({ operation, filePath });

    if (result.data) {
      client.cache.set(filePath, result);
      if (client.cache.size > 256)
        client.cache.delete(client.cache.keys().next().value);
    }

    return result;
  }

  let staging;

  try {
    if (
      !Array.isArray(fileList) ||
      !fileList.length ||
      !fileList.every(isPhotoPath)
    )
      throw new Error('请选择照片或视频');
    if (typeof destination !== 'string' || !path.isAbsolute(destination))
      throw new Error('本地目标目录无效');
    const folder = await fs.realpath(destination);

    if (!(await fs.stat(folder)).isDirectory())
      throw new Error('本地目标不是目录');
    const names = fileList.map((file) => path.basename(file));

    if (new Set(names).size !== names.length)
      throw new Error('所选项目包含重名文件，请分批导出');
    for (const name of names) {
      if (!name || name === '.' || name === '..') throw new Error('文件名无效');
      // lstat also detects dangling symlinks. Never replace an existing target.
      try {
        await fs.lstat(path.join(folder, name));
      } catch (error) {
        if (error.code === 'ENOENT') continue;
        throw error;
      }

      throw new Error('目标已存在，请选择其他目录或先重命名');
    }

    for (let i = 0; i < fileList.length; i += 1) {
      staging = await fs.mkdtemp(path.join(folder, '.openmtp-photo-'));
      const progress = (fraction) =>
        onProgress?.({
          currentFile: fileList[i],
          activeFileSize: 0,
          activeFileSizeSent: 0,
          activeFileProgress: Math.min(100, Math.max(0, fraction * 100)),
          totalFiles: fileList.length,
          filesSent: i,
          totalFileSize: 0,
          totalFileSizeSent: 0,
          totalFileProgress: ((i + fraction) / fileList.length) * 100,
          elapsedTime: '--',
          speed: '--',
          direction: 'download',
          indeterminate: fraction === 0,
        });

      progress(0);
      const result = await client.request(
        { operation: 'download', filePath: fileList[i], destination: staging },
        progress
      );

      if (result.error) throw new Error(result.error);
      const source = path.join(staging, names[i]);
      const stat = await fs.lstat(source);

      if (!stat.isFile() || stat.isSymbolicLink())
        throw new Error('导出文件无效');
      await fs.link(source, path.join(folder, names[i]));
      await fs.rm(staging, { recursive: true, force: true });
      staging = null;
      progress(1);
    }

    return success(true);
  } catch (error) {
    return failure(error.message);
  } finally {
    if (staging) await fs.rm(staging, { recursive: true, force: true });
  }
}
