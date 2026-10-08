import { BrowserWindow, ipcMain } from 'electron';
import koffi from 'koffi';
import path from 'path';
import { promises as fs, constants } from 'fs';
import { randomBytes } from 'crypto';
import { deviceDragLibPath } from '../../helpers/binaries';

export function registerDeviceDrag() {
  if (process.platform !== 'darwin') return;
  let native;
  let callback;
  const drags = new Map();
  const writes = new Map();
  const forget = (id) => {
    const drag = drags.get(id);

    if (drag?.onDestroyed)
      drag.sender.removeListener('destroyed', drag.onDestroyed);
    drags.delete(id);
  };
  let tail = Promise.resolve();
  const report = (sender, message) => {
    if (!sender.isDestroyed()) sender.send('device-drag:error', message);
  };
  const load = () => {
    if (native) return native;
    const library = koffi.load(deviceDragLibPath);
    const callbackType = koffi.proto(
      'void DeviceDragCallback(const char *json)'
    );

    native = {
      begin: library.func(
        'const char *BeginDeviceDrag(void *view, const char *json, DeviceDragCallback *callback)'
      ),
      complete: library.func(
        'void CompleteDevicePromise(const char *token, const char *error)'
      ),
      test: library.func(
        'void TestDevicePromise(const char *json, const char *directory, DeviceDragCallback *callback)'
      ),
    };
    callback = koffi.register((json) => {
      const event = JSON.parse(json);
      const drag = drags.get(event.drag);

      if (!drag) return;
      if (event.event === 'end') {
        if (!drag.sender.isDestroyed()) drag.sender.send('device-drag:end');
        if (!event.copied) forget(event.drag);
      } else if (event.event === 'received') {
        drag.resolveTest?.(event);
        forget(event.drag);
      } else if (event.event === 'write') {
        // Multiple promised files are downloaded sequentially through the existing transport.
        tail = tail
          .then(async () => {
            let staging;

            try {
              if (drag.sender.isDestroyed()) throw new Error('文件窗口已关闭');
              staging = await fs.mkdtemp(
                path.join(path.dirname(event.destination), '.openmtp-drag-')
              );
              await new Promise((resolve, reject) => {
                const closed = () => reject(new Error('文件窗口已关闭'));

                drag.sender.once('destroyed', closed);
                writes.set(event.token, {
                  senderId: drag.sender.id,
                  resolve,
                  reject,
                });
                drag.sender.send('device-drag:download', {
                  token: event.token,
                  destination: staging,
                  file: drag.files[event.index],
                  storageId: drag.storageId,
                  serial: drag.serial,
                });
                // Remove the listener after this individual transfer settles.
                writes.get(event.token).cleanup = () =>
                  drag.sender.removeListener('destroyed', closed);
              });
              const source = path.join(staging, drag.files[event.index].name);
              const stat = await fs.lstat(source);

              if (stat.isDirectory()) {
                try {
                  await fs.lstat(event.destination);
                  throw new Error('目标文件已存在，请选择其他名称');
                } catch (error) {
                  if (error.code !== 'ENOENT') throw error;
                }

                await fs.rename(source, event.destination);
              } else {
                // Exclusive creation: never silently replace an existing local file.
                try {
                  await fs.link(source, event.destination);
                } catch (error) {
                  if (
                    !['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'EXDEV'].includes(
                      error.code
                    )
                  )
                    throw error;
                  await fs.copyFile(
                    source,
                    event.destination,
                    constants.COPYFILE_EXCL
                  );
                }
              }

              native.complete(event.token, '');
            } catch (error) {
              native.complete(event.token, error.message);
              report(drag.sender, `拖出文件失败：${error.message}`);
            } finally {
              drag.completed += 1;
              if (drag.completed === drag.files.length && !drag.resolveTest)
                forget(event.drag);
              writes.get(event.token)?.cleanup();
              writes.delete(event.token);
              if (staging)
                await fs
                  .rm(staging, { recursive: true, force: true })
                  .catch(() => {});
            }

            return null;
          })
          .catch((error) => report(drag.sender, error.message));
      }
    }, koffi.pointer(callbackType));

    return native;
  };
  const prepare = (sender, request) => {
    if (!Array.isArray(request.files) || !request.files.length)
      throw new Error('请先选择文件');
    const files = request.files.map((file) => {
      if (
        typeof file.path !== 'string' ||
        !file.path.startsWith('/') ||
        file.path.includes('\0') ||
        file.path.split('/').includes('..') ||
        path.posix.normalize(file.path) === '/'
      )
        throw new Error('设备路径无效');

      return {
        path: file.path,
        name: path.posix.basename(file.path),
        isFolder: Boolean(file.isFolder),
      };
    });
    const id = randomBytes(12).toString('hex');

    drags.set(id, {
      sender,
      completed: 0,
      files,
      storageId: request.storageId,
      serial: request.serial,
    });

    const onDestroyed = () => forget(id);

    drags.get(id).onDestroyed = onDestroyed;
    sender.once('destroyed', onDestroyed);

    return { id, files };
  };

  ipcMain.on('device-drag:start', ({ sender }, request) => {
    let config;

    try {
      const library = load();
      const window = BrowserWindow.fromWebContents(sender);

      config = prepare(sender, request);
      const error = library.begin(
        koffi.decode(window.getNativeWindowHandle(), 'void *'),
        JSON.stringify(config),
        callback
      );

      if (error) throw new Error(error);
    } catch (error) {
      if (config) forget(config.id);
      report(sender, error.message);
    }
  });
  ipcMain.on('device-drag:downloaded', ({ sender }, { token, error }) => {
    const write = writes.get(token);

    if (!write || write.senderId !== sender.id) return;
    if (error) write.reject(new Error(error));
    else write.resolve();
  });
  if (process.env.NODE_ENV === 'development') {
    ipcMain.handle('device-drag:test', ({ sender }, request) => {
      const library = load();
      const config = prepare(sender, request);

      return new Promise((resolve) => {
        drags.get(config.id).resolveTest = resolve;
        library.test(JSON.stringify(config), request.destination, callback);
      });
    });
  }
}
