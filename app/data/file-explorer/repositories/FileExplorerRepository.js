import { ipcRenderer } from 'electron';
import { FileExplorerIosDataSource } from '../data-sources/FileExplorerIosDataSource';
import { clearDirectoryCache } from '../../../services/directory-cache';
import { FileExplorerAdbDataSource } from '../data-sources/FileExplorerAdbDataSource';
import { FileExplorerHdcDataSource } from '../data-sources/FileExplorerHdcDataSource';
import { FileExplorerLegacyDataSource } from '../data-sources/FileExplorerLegacyDataSource';
import { FileExplorerLocalDataSource } from '../data-sources/FileExplorerLocalDataSource';
import { FileExplorerKalamDataSource } from '../data-sources/FileExplorerKalamDataSource';
import { DEVICE_TYPE, MTP_MODE } from '../../../enums';
import { checkIf } from '../../../utils/checkIf';
import { getMtpModeSetting } from '../../../helpers/settings';

export class FileExplorerRepository {
  constructor() {
    this.adbDataSource = new FileExplorerAdbDataSource();
    this.useAdb = false;
    this.hdcDataSource = new FileExplorerHdcDataSource();
    this.useHdc = false;
    this.iosDataSource = new FileExplorerIosDataSource();
    this.useIos = false;
    this.legacyMtpDataSource = new FileExplorerLegacyDataSource();
    this.localDataSource = new FileExplorerLocalDataSource();
    this.kalamMtpDataSource = new FileExplorerKalamDataSource();
  }

  async prepareDevice() {
    clearDirectoryCache();
    this.useAdb = false;
    this.useHdc = false;
    this.useIos = await this.iosDataSource.connect();
    if (this.useIos) return true;

    if (await this.prepareAdb()) return true;
    this.useHdc = await this.hdcDataSource.connect();
    if (this.useHdc) return true;
    const devices = await ipcRenderer.invoke('preview:devices').catch(() => ({
      devices: [],
    }));

    if (devices.devices?.some((device) => device.transport === 'hdc'))
      this.kalamMtpDataSource.useHarmonyWorker();
    else this.kalamMtpDataSource.useNativeKernel();

    return false;
  }

  get remoteDataSource() {
    if (this.useIos) return this.iosDataSource;

    return this.useHdc ? this.hdcDataSource : this.adbDataSource;
  }

  async prepareAdb() {
    clearDirectoryCache();
    this.useAdb = await this.adbDataSource.connect();

    return this.useAdb;
  }

  /**
   * description - Initialize
   *
   * @return {Promise<{data: object, error: string|null, stderr: string|null}>}
   */
  async initialize({ deviceType }) {
    const selectedMtpMode = getMtpModeSetting();

    checkIf(deviceType, 'string');

    if (deviceType === DEVICE_TYPE.mtp) {
      if (this.useIos || this.useAdb || this.useHdc)
        return this.remoteDataSource.initialize();
      switch (selectedMtpMode) {
        case MTP_MODE.legacy:
          throw `initialize for MTP_MODE.legacy is unimplemented`;

        case MTP_MODE.kalam:
        default:
          return this.kalamMtpDataSource.initialize();
      }
    }

    throw `initialize for deviceType=DEVICE_TYPE.local is unimplemented`;
  }

  /**
   * description - Dispose
   *
   * @return {Promise<{data: object, error: string|null, stderr: string|null}>}
   */
  async dispose({ deviceType }) {
    clearDirectoryCache();
    checkIf(deviceType, 'string');

    const selectedMtpMode = getMtpModeSetting();

    if (deviceType === DEVICE_TYPE.mtp) {
      if (this.useIos || this.useAdb || this.useHdc)
        return this.remoteDataSource.dispose();
      switch (selectedMtpMode) {
        case MTP_MODE.legacy:
          return;

        case MTP_MODE.kalam:
        default:
          return this.kalamMtpDataSource.dispose();
      }
    }

    throw `dispose for deviceType=DEVICE_TYPE.local is unimplemented`;
  }

  /**
   * description - Fetch storages
   *
   * @return {Promise<{data: object|boolean, error: string|null, stderr: string|null}>}
   */
  async listStorages({ deviceType }) {
    const selectedMtpMode = getMtpModeSetting();

    if (deviceType === DEVICE_TYPE.mtp) {
      if (this.useIos || this.useAdb || this.useHdc)
        return this.remoteDataSource.listStorages();
      switch (selectedMtpMode) {
        case MTP_MODE.legacy:
          return this.legacyMtpDataSource.listStorages();

        case MTP_MODE.kalam:
        default:
          return this.kalamMtpDataSource.listStorages();
      }
    }

    throw `listStorages for deviceType=DEVICE_TYPE.local is unimplemented`;
  }

  /**
   * description - Fetch files in the path
   *
   * @param deviceType
   * @param filePath
   * @param ignoreHidden
   * @param storageId
   * @return {Promise<{data: array|null, error: string|null, stderr: string|null}>}
   */
  async listFiles({ deviceType, filePath, ignoreHidden, storageId }) {
    if (deviceType === DEVICE_TYPE.mtp) {
      if (this.useIos || this.useAdb || this.useHdc)
        return this.remoteDataSource.listFiles({
          filePath,
          ignoreHidden,
          storageId,
        });
      checkIf(storageId, 'number');

      const selectedMtpMode = getMtpModeSetting();

      switch (selectedMtpMode) {
        case MTP_MODE.legacy:
          return this.legacyMtpDataSource.listFiles({
            filePath,
            ignoreHidden,
            storageId,
          });

        case MTP_MODE.kalam:
        default:
          return this.kalamMtpDataSource.listFiles({
            filePath,
            ignoreHidden,
            storageId,
          });
      }
    }

    return this.localDataSource.listFiles({
      filePath,
      ignoreHidden,
    });
  }

  /**
   * description - Rename a file
   *
   * @param deviceType
   * @param filePath
   * @param newFilename
   * @param storageId
   * @return {Promise<{data: null|boolean, error: string|null, stderr: string|null}>}
   */
  async renameFile({ deviceType, filePath, newFilename, storageId }) {
    clearDirectoryCache();
    if (deviceType === DEVICE_TYPE.mtp) {
      if (this.useIos || this.useAdb || this.useHdc)
        return this.remoteDataSource.renameFile({
          filePath,
          newFilename,
          storageId,
        });
      checkIf(storageId, 'number');

      const selectedMtpMode = getMtpModeSetting();

      switch (selectedMtpMode) {
        case MTP_MODE.legacy:
          return this.legacyMtpDataSource.renameFile({
            filePath,
            newFilename,
            storageId,
          });

        case MTP_MODE.kalam:
        default:
          return this.kalamMtpDataSource.renameFile({
            filePath,
            newFilename,
            storageId,
          });
      }
    }

    return this.localDataSource.renameFile({
      filePath,
      newFilename,
    });
  }

  /**
   * description - Delete files
   *
   * @param deviceType
   * @param fileList
   * @param storageId
   * @return {Promise<{data: null|boolean, error: string|null, stderr: string|null}>}
   */
  async deleteFiles({ deviceType, fileList, storageId }) {
    clearDirectoryCache();
    if (deviceType === DEVICE_TYPE.mtp) {
      if (this.useIos || this.useAdb || this.useHdc)
        return this.remoteDataSource.deleteFiles({ fileList, storageId });
      checkIf(storageId, 'number');

      const selectedMtpMode = getMtpModeSetting();

      switch (selectedMtpMode) {
        case MTP_MODE.legacy:
          return this.legacyMtpDataSource.deleteFiles({
            fileList,
            storageId,
          });

        case MTP_MODE.kalam:
        default:
          return this.kalamMtpDataSource.deleteFiles({
            fileList,
            storageId,
          });
      }
    }

    return this.localDataSource.deleteFiles({
      fileList,
    });
  }

  /**
   * description - Create a directory
   *
   * @param deviceType
   * @param filePath
   * @param storageId
   * @return {Promise<{data: null|boolean, error: string|null, stderr: string|null}>}
   */
  async makeDirectory({ deviceType, filePath, storageId }) {
    clearDirectoryCache();
    if (deviceType === DEVICE_TYPE.mtp) {
      if (this.useIos || this.useAdb || this.useHdc)
        return this.remoteDataSource.makeDirectory({ filePath, storageId });
      checkIf(storageId, 'number');

      const selectedMtpMode = getMtpModeSetting();

      switch (selectedMtpMode) {
        case MTP_MODE.legacy:
          return this.legacyMtpDataSource.makeDirectory({
            filePath,
            storageId,
          });

        case MTP_MODE.kalam:
        default:
          return this.kalamMtpDataSource.makeDirectory({
            filePath,
            storageId,
          });
      }
    }

    return this.localDataSource.makeDirectory({
      filePath,
    });
  }

  /**
   * description - Check if files exist
   *
   * @param {string} deviceType
   * @param {[string]} fileList
   * @param {string} storageId
   * @return {Promise<boolean>}
   */
  async filesExist({ deviceType, fileList, storageId }) {
    if (deviceType === DEVICE_TYPE.mtp) {
      if (this.useIos || this.useAdb || this.useHdc)
        return this.remoteDataSource.filesExist({ fileList, storageId });
      checkIf(storageId, 'number');

      const selectedMtpMode = getMtpModeSetting();

      switch (selectedMtpMode) {
        case MTP_MODE.legacy:
          return this.legacyMtpDataSource.filesExist({
            fileList,
            storageId,
          });

        case MTP_MODE.kalam:
        default:
          return this.kalamMtpDataSource.filesExist({
            fileList,
            storageId,
          });
      }
    }

    return this.localDataSource.filesExist({
      fileList,
    });
  }

  /**
   * description - Upload or download files from MTP device to local or vice versa
   *
   * @param {string} deviceType
   * @param {string} destination
   * @param {'upload'|'download'} direction
   * @param {[string]} fileList
   * @param {string} storageId
   * @param {errorCallback} onError
   * @param {progressCallback} onProgress
   * @param {preprocessCallback} onPreprocess
   * @param {completedCallback} onCompleted
   *
   * @return
   */
  transferFiles({
    deviceType,
    destination,
    fileList,
    direction,
    storageId,
    onError,
    onPreprocess,
    onProgress,
    onCompleted,
  }) {
    clearDirectoryCache();
    if (deviceType === DEVICE_TYPE.mtp) {
      if (this.useIos || this.useAdb || this.useHdc)
        return this.remoteDataSource.transferFiles({
          destination,
          fileList,
          direction,
          storageId,
          onError,
          onPreprocess,
          onProgress,
          onCompleted,
        });
      checkIf(storageId, 'number');
      checkIf(onPreprocess, 'function');

      const selectedMtpMode = getMtpModeSetting();

      switch (selectedMtpMode) {
        case MTP_MODE.legacy:
          return this.legacyMtpDataSource.transferFiles({
            destination,
            fileList,
            direction,
            storageId,
            onError,
            onProgress,
            onCompleted,
            onPreprocess,
          });

        case MTP_MODE.kalam:
        default:
          return this.kalamMtpDataSource.transferFiles({
            deviceType,
            destination,
            fileList,
            direction,
            storageId,
            onError,
            onProgress,
            onCompleted,
            onPreprocess,
          });
      }
    }

    // eslint-disable-next-line no-throw-literal
    throw `transferFiles for deviceType=DEVICE_TYPE.local is unimplemented`;
  }

  /**
   * description: fetch the data for generating bug/error reports
   *
   * @param {string} deviceType
   * @return {Promise<{data: string|null, error: string|null, stderr: string|null}>}
   */
  async fetchDebugReport({ deviceType }) {
    const selectedMtpMode = getMtpModeSetting();

    if (deviceType === DEVICE_TYPE.mtp) {
      switch (selectedMtpMode) {
        case MTP_MODE.legacy:
          return this.legacyMtpDataSource.fetchDebugReport();

        case MTP_MODE.kalam:
        default:
          return this.kalamMtpDataSource.fetchDebugReport();
      }
    }

    // eslint-disable-next-line no-throw-literal
    throw `fetchDebugReport for deviceType=DEVICE_TYPE.local is unimplemented`;
  }
}
