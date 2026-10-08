import { hdcRequest } from '../../../services/hdc-files/client';
import { FileExplorerLegacyDataSource } from './FileExplorerLegacyDataSource';

export class FileExplorerHdcDataSource {
  connection = null;

  mtp = new FileExplorerLegacyDataSource();

  mtpStorageId = null;

  mtpStorages = null;

  mtpRootFiles = null;

  connectPromise = null;

  connect() {
    if (!this.connectPromise)
      this.connectPromise = this.connectDevice().finally(() => {
        this.connectPromise = null;
      });

    return this.connectPromise;
  }

  async connectDevice() {
    this.connection = await hdcRequest('connect');

    this.mtpStorageId = null;
    this.mtpStorages = null;
    this.mtpRootFiles = null;

    if (!this.connection.data) return false;

    // HDC can only see media_fuse/Photo. An MTP USB session exposes the
    // phone's user-shared storage, so prefer it when both listing steps work.
    const storages = await this.mtp.listStorages();

    if (!storages.error && !storages.stderr && storages.data) {
      const selected = Object.keys(storages.data).find(
        (id) => storages.data[id].selected
      );

      if (selected) {
        const storageId = Number(selected);
        const root = await this.mtp.listFiles({
          filePath: '/',
          ignoreHidden: false,
          storageId,
        });

        if (!root.error && !root.stderr && Array.isArray(root.data)) {
          this.mtpStorageId = storageId;
          this.mtpStorages = storages;
          this.mtpRootFiles = root;
          this.connection = {
            ...this.connection,
            data: {
              ...this.connection.data,
              mediaOnly: false,
              fileTransport: 'mtp',
            },
          };
        }
      }
    }

    return Boolean(this.connection.data);
  }

  initialize() {
    return this.connection;
  }

  async dispose() {
    this.connection = null;

    this.mtpStorageId = null;
    this.mtpStorages = null;
    this.mtpRootFiles = null;

    return hdcRequest('dispose');
  }

  listStorages() {
    if (this.mtpStorageId !== null) return this.mtpStorages;

    return hdcRequest('listStorages');
  }

  listFiles(options) {
    if (this.mtpStorageId !== null) {
      if (options.filePath === '/' && this.mtpRootFiles) {
        const root = this.mtpRootFiles;

        this.mtpRootFiles = null;

        return options.ignoreHidden
          ? {
              ...root,
              data: root.data.filter((item) => !item.name.startsWith('.')),
            }
          : root;
      }

      return this.mtp.listFiles(options);
    }

    return hdcRequest('listFiles', options);
  }

  renameFile(options) {
    if (this.mtpStorageId !== null) return this.mtp.renameFile(options);

    return hdcRequest('renameFile', options);
  }

  deleteFiles(options) {
    if (this.mtpStorageId !== null) return this.mtp.deleteFiles(options);

    return hdcRequest('deleteFiles', options);
  }

  makeDirectory(options) {
    if (this.mtpStorageId !== null) return this.mtp.makeDirectory(options);

    return hdcRequest('makeDirectory', options);
  }

  async filesExist(options) {
    if (this.mtpStorageId !== null) return this.mtp.filesExist(options);

    const result = await hdcRequest('filesExist', options);

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
    onPreprocess({ fullPath: options.fileList[0] });
    if (this.mtpStorageId !== null)
      return this.mtp.transferFiles({
        ...options,
        onProgress,
        onCompleted,
        onError,
      });

    try {
      const result = await hdcRequest('transferFiles', options, onProgress);

      if (result.error) onError(result);
      else onCompleted();

      return result;
    } catch (error) {
      const result = {
        error: error.message,
        stderr: `HDC: ${error.message}`,
        data: null,
      };

      onError(result);

      return result;
    }
  }
}
