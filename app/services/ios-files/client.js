import { ipcRenderer } from 'electron';
import { randomBytes } from 'crypto';

export async function iosRequest(
  operation,
  options = {},
  onProgress = () => {}
) {
  const id = randomBytes(12).toString('hex');
  const listener = (_, progress) => {
    if (progress.id === id) onProgress(progress);
  };

  ipcRenderer.on('ios-files:progress', listener);
  try {
    return await ipcRenderer.invoke('ios-files:request', {
      ...options,
      operation,
      id,
    });
  } finally {
    ipcRenderer.removeListener('ios-files:progress', listener);
  }
}
