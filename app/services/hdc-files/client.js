import { ipcRenderer } from 'electron';
import { randomBytes } from 'crypto';

export async function hdcRequest(
  operation,
  options = {},
  onProgress = () => {}
) {
  const id = randomBytes(12).toString('hex');
  const listener = (_, progress) => {
    if (progress.id === id) onProgress(progress);
  };

  ipcRenderer.on('hdc-files:progress', listener);
  try {
    return await ipcRenderer.invoke('hdc-files:request', {
      ...options,
      operation,
      id,
    });
  } finally {
    ipcRenderer.removeListener('hdc-files:progress', listener);
  }
}
