import { ipcRenderer } from 'electron';
import { randomBytes } from 'crypto';

export async function adbRequest(
  operation,
  options = {},
  onProgress = () => {}
) {
  const id = randomBytes(12).toString('hex');
  const listener = (_, progress) => {
    if (progress.id === id) onProgress(progress);
  };

  ipcRenderer.on('adb-files:progress', listener);
  try {
    return await ipcRenderer.invoke('adb-files:request', {
      ...options,
      operation,
      id,
    });
  } finally {
    ipcRenderer.removeListener('adb-files:progress', listener);
  }
}
