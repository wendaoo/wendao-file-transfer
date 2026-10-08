import { adbRequest } from '../../../services/adb-files/client';

export class FileExplorerAdbDataSource {
  connection = null;

  async connect() {
    this.connection = await adbRequest('connect');

    return Boolean(this.connection.data || this.connection.error);
  }

  initialize() {
    return this.connection;
  }

  async dispose() {
    this.connection = null;

    return adbRequest('dispose');
  }

  listStorages() {
    return adbRequest('listStorages');
  }

  listFiles(options) {
    return adbRequest('listFiles', options);
  }

  renameFile(options) {
    return adbRequest('renameFile', options);
  }

  deleteFiles(options) {
    return adbRequest('deleteFiles', options);
  }

  makeDirectory(options) {
    return adbRequest('makeDirectory', options);
  }

  async filesExist(options) {
    const result = await adbRequest('filesExist', options);

    if (result.error) throw new Error(result.error);

    return result.data;
  }

  async transferFiles({
    onProgress,
    onCompleted,
    onError,
    onPreprocess,
    ...options
  }) {
    // Show activity while folder sizes are being collected, before adb starts.
    onPreprocess({ fullPath: options.fileList[0] });
    try {
      const result = await adbRequest('transferFiles', options, onProgress);

      if (result.error) onError(result);
      else onCompleted();

      return result;
    } catch (error) {
      const result = {
        error: error.message,
        stderr: `ADB: ${error.message}`,
        data: null,
      };

      onError(result);

      return result;
    }
  }
}
