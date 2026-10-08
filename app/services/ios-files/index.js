import { ipcMain } from 'electron';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { iosFilesPath } from '../../helpers/binaries';
import { PHOTO_ROOT, isPhotoPath, photoRequest, disposePhotos } from './photos';

const sessions = new Map();
const busy = new Set();
const queues = new Map();
const success = (data) => ({ data, error: null, stderr: null });
const failure = (message) => ({
  data: null,
  error: message,
  stderr: `iOS: ${message}`,
});

// No shell and no commands supplied by the renderer. A dedicated process owns
// each device connection, so unplugging or a stalled AFC service cannot hang UI.
export function runIosHelper(request, sender, onProgress = () => {}) {
  return new Promise((resolve) => {
    if (!existsSync(iosFilesPath)) {
      resolve(failure('缺少 iOS 通信组件，请重新构建应用'));

      return;
    }

    const child = spawn(iosFilesPath, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    let pending = '';
    let diagnostic = '';
    let result;
    let timedOut = false;
    const stop = () => child.kill();
    let timer;
    const touch = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, 90000);
    };
    const finish = (value) => {
      clearTimeout(timer);
      sender?.removeListener('destroyed', stop);
      resolve(value);
    };

    sender?.once('destroyed', stop);
    touch();
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      touch();
      pending += chunk.toString();
      if (pending.length > 32 * 1024 * 1024) {
        child.kill();

        return;
      }

      let boundary;

      // eslint-disable-next-line no-cond-assign
      while ((boundary = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, boundary);

        pending = pending.slice(boundary + 1);
        try {
          const value = JSON.parse(line);

          if (value.progress) onProgress(value.progress);
          else result = value;
        } catch (_) {
          diagnostic = 'iOS 通信组件返回了无效数据';
        }
      }
    });
    child.stderr.on('data', (chunk) => {
      diagnostic = (diagnostic + chunk).slice(-1500);
    });
    child.stdin.on('error', () => {});
    child.once('error', (error) => finish(failure(error.message)));
    child.once('close', (code) =>
      finish(
        code === 0 && result
          ? result
          : failure(
              timedOut
                ? 'iPhone 响应超时，请解锁设备并重新连接；未完成的临时文件可能需要清理'
                : diagnostic || 'iPhone 连接中断，传输未完成'
            )
      )
    );
    child.stdin.end(JSON.stringify(request));
  });
}

export function registerIosFiles() {
  const handle = async (sender, request, expectedSerial) => {
    const allowed = [
      'thumbnail',
      'connect',
      'devices',
      'dispose',
      'listStorages',
      'listFiles',
      'filesExist',
      'makeDirectory',
      'renameFile',
      'deleteFiles',
      'transferFiles',
    ];
    const operation = request?.operation;

    if (!allowed.includes(operation)) return failure('不支持的 iOS 操作');
    if (process.platform !== 'darwin')
      return operation === 'connect'
        ? success(null)
        : failure('iOS 文件共享目前仅支持 macOS');
    if (operation === 'devices') return runIosHelper({ operation }, sender);
    if (busy.has(sender.id)) return failure('iOS 操作正在进行，请稍后重试');
    busy.add(sender.id);
    try {
      if (operation === 'dispose') {
        disposePhotos(sender);
        sessions.delete(sender.id);

        return success(true);
      }

      if (operation === 'connect') {
        disposePhotos(sender);
        const result = await runIosHelper({ operation }, sender);

        if (!sessions.has(sender.id))
          sender.once('destroyed', () => sessions.delete(sender.id));
        if (result.data)
          sessions.set(sender.id, result.data.usbDeviceInfo.SerialNumber);
        else sessions.delete(sender.id);

        return result;
      }

      const serial = sessions.get(sender.id);

      if (!serial) return failure('iPhone 尚未连接，请点击重新连接');
      if (serial !== expectedSerial)
        return failure('设备连接已变化，请重新执行操作');
      const {
        storageId,
        filePath,
        fileList,
        destination,
        direction,
        newFilename,
        ignoreHidden,
        id,
      } = request;

      if (
        isPhotoPath(filePath) ||
        (direction === 'upload' && isPhotoPath(destination)) ||
        (direction !== 'upload' && fileList?.some(isPhotoPath))
      )
        return await photoRequest(sender, serial, request, (progress) => {
          if (!sender.isDestroyed())
            sender.send('ios-files:progress', { ...progress, id });
        });
      if (operation === 'thumbnail') return success(null);

      const result = await runIosHelper(
        {
          operation,
          serial,
          storageId,
          filePath,
          fileList,
          destination,
          direction,
          newFilename,
          ignoreHidden,
        },
        sender,
        (progress) => {
          if (!sender.isDestroyed())
            sender.send('ios-files:progress', { ...progress, id });
        }
      );

      if (
        operation === 'listFiles' &&
        filePath === '/' &&
        !result.error &&
        Array.isArray(result.data)
      ) {
        result.data.unshift({
          path: PHOTO_ROOT,
          name: '照片与视频',
          isFolder: true,
          isAppRoot: true,
          size: 0,
          dateAdded: '1970-01-01T00:00:00Z',
        });
      }

      return result;
    } finally {
      busy.delete(sender.id);
    }
  };

  ipcMain.handle('ios-files:request', ({ sender }, request) => {
    if (request?.operation === 'devices') return handle(sender, request);
    const expectedSerial = sessions.get(sender.id);
    const previous = queues.get(sender.id) || Promise.resolve();
    const current = previous
      .catch(() => {})
      .then(() => {
        if (sender.isDestroyed()) return failure('文件窗口已关闭');

        return handle(sender, request, expectedSerial);
      });

    queues.set(sender.id, current);

    return current.finally(() => {
      if (queues.get(sender.id) === current) queues.delete(sender.id);
    });
  });
}
