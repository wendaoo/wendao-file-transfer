import { ipcMain, app } from 'electron';
import { fork } from 'child_process';
import path from 'path';
import { kalamLibPath } from '../../helpers/binaries';

const failed = (message) => ({ error: message, stderr: null, data: null });
let worker;
let initialized;
const pending = new Map();

function stopWorker(message = 'MTP 连接已结束') {
  if (worker) {
    worker.kill();
    worker = null;
  }

  initialized = null;
  pending.forEach((request) => {
    clearTimeout(request.timer);
    request.resolve(failed(message));
  });
  pending.clear();
}

function getWorker() {
  if (worker) return worker;
  const script = path.join(__dirname, 'services/mtp-worker.cjs');

  worker = fork(script, [kalamLibPath], {
    execPath: process.execPath,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    silent: true,
  });
  const child = worker;

  child.on('message', (message) => {
    const request = pending.get(message.id);

    if (!request) return;
    if (message.type === 'done') {
      clearTimeout(request.timer);
      pending.delete(message.id);
      if (request.method === 'initialize' && !message.value.error)
        initialized = message.value;
      request.resolve(message.value);
    } else if (!request.sender.isDestroyed()) {
      request.sender.send('mtp-worker:event', message);
    }
  });
  child.on('exit', () => {
    if (worker === child) stopWorker('MTP 内核已退出，请重新插拔 USB 后重试');
  });
  child.on('error', (error) => {
    if (worker === child) stopWorker(error.message);
  });

  return child;
}

export function registerMtpWorker() {
  ipcMain.handle('mtp-worker:call', (event, request) => {
    if (
      !request ||
      !Number.isSafeInteger(request.id) ||
      typeof request.method !== 'string'
    )
      return failed('MTP 请求无效');
    if (request.method === 'dispose') {
      stopWorker();

      return { error: null, stderr: null, data: true };
    }

    if (request.method === 'initialize' && initialized) return initialized;
    const child = getWorker();

    return new Promise((resolve) => {
      const timer = setTimeout(
        () => {
          stopWorker('MTP 操作超时，请重新插拔 USB 后重试');
        },
        ['download', 'upload'].includes(request.method) ? 300000 : 25000
      );

      pending.set(request.id, {
        resolve,
        timer,
        sender: event.sender,
        method: request.method,
      });
      child.send(request, (error) => {
        if (error) stopWorker(error.message);
      });
    });
  });
  app.on('before-quit', () => stopWorker());
}
