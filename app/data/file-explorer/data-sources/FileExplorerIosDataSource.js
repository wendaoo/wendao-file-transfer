import { iosRequest } from '../../../services/ios-files/client';

export class FileExplorerIosDataSource {
  connection = null;

  async connect() {
    this.connection = await iosRequest('connect');

    return Boolean(this.connection.data || this.connection.error);
  }

  initialize() {
    return this.connection;
  }

  async dispose() {
    this.connection = null;

    return iosRequest('dispose');
  }

  listStorages() {
    return iosRequest('listStorages');
  }

  listFiles(options) {
    return iosRequest('listFiles', options);
  }

  renameFile(options) {
    return iosRequest('renameFile', options);
  }

  deleteFiles(options) {
    return iosRequest('deleteFiles', options);
  }

  makeDirectory(options) {
    return iosRequest('makeDirectory', options);
  }

  async filesExist(options) {
    const result = await iosRequest('filesExist', options);

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
    // Show activity while folder sizes are being collected, before the iOS transfer starts.
    onPreprocess({ fullPath: options.fileList[0] });
    try {
      const result = await iosRequest('transferFiles', options, onProgress);

      if (result.error) onError(result);
      else onCompleted();

      return result;
    } catch (error) {
      const result = {
        error: error.message,
        stderr: `iOS: ${error.message}`,
        data: null,
      };

      onError(result);

      return result;
    }
  }
}
