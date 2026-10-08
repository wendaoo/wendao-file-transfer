import { ipcRenderer } from 'electron';

let nextId = 0;

export default class MtpWorkerProxy {
  call(method, args = null) {
    nextId += 1;

    return ipcRenderer.invoke('mtp-worker:call', {
      id: Date.now() * 1000 + (nextId % 1000),
      method,
      args,
    });
  }

  initialize() {
    return this.call('initialize');
  }

  fetchDeviceInfo() {
    return this.call('fetchDeviceInfo');
  }

  listStorages() {
    return this.call('listStorages');
  }

  fileExist(args) {
    return this.call('fileExist', args);
  }

  deleteFile(args) {
    return this.call('deleteFile', args);
  }

  makeDirectory(args) {
    return this.call('makeDirectory', args);
  }

  renameFile(args) {
    return this.call('renameFile', args);
  }

  walk(args) {
    return this.call('walk', args);
  }

  dispose() {
    return this.call('dispose');
  }

  async transferFiles({
    onPreprocess,
    onProgress,
    onError,
    onCompleted,
    direction,
    ...args
  }) {
    nextId += 1;
    const id = Date.now() * 1000 + (nextId % 1000);
    const listener = (_, event) => {
      if (event.id !== id) return;
      if (event.value.error) onError(event.value);
      else if (event.type === 'preprocess') onPreprocess(event.value.data);
      else if (event.type === 'progress') onProgress(event.value.data);
    };

    ipcRenderer.on('mtp-worker:event', listener);
    try {
      const result = await ipcRenderer.invoke('mtp-worker:call', {
        id,
        method: direction,
        args,
      });

      if (result.error || result.stderr) onError(result);
      else onCompleted();

      return result;
    } finally {
      ipcRenderer.removeListener('mtp-worker:event', listener);
    }
  }
}
