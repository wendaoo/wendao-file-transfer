import React, { PureComponent, Fragment } from 'react';
import { ipcRenderer } from 'electron';
import { withStyles } from '@material-ui/core/styles';
import { connect } from 'react-redux';
import UsbIcon from '@material-ui/icons/Usb';
import FileExplorer from './components/FileExplorer';
import ToolbarAreaPane from './components/ToolbarAreaPane';
import DevicePreview from './components/DevicePreview';
import { styles } from './styles';
import { initializeMtp, actionSetMtpStatus } from './actions';
import { DEVICE_TYPE, MTP_MODE } from '../../enums';
import { makeMtpMode } from '../Settings/selectors';
import { makeMtpDevice, makeMtpStoragesList } from './selectors';

const HIDDEN_LEGACY_COLUMNS = ['size'];
const HIDDEN_KALAM_COLUMNS = [];

class Home extends PureComponent {
  constructor(props) {
    super(props);
    this.state = { filesVisible: false, resizing: true };
  }

  componentDidMount() {
    ipcRenderer
      .invoke('files:window-state')
      .then((filesVisible) => {
        this.setState({ filesVisible, resizing: false });

        return null;
      })
      .catch((error) => {
        this.setState({ resizing: false });
        console.error('读取设备文件窗口状态失败', error);
      });
  }

  handleToggleFiles = async () => {
    const { filesVisible, resizing } = this.state;

    if (resizing) return;
    this.setState({ resizing: true });
    try {
      const visible = await ipcRenderer.invoke(
        'files:set-visible',
        !filesVisible
      );

      this.setState({ filesVisible: visible });
    } catch (error) {
      console.error('切换设备文件窗口失败', error);
    } finally {
      this.setState({ resizing: false });
    }
  };

  handleDisconnected = (serial) => {
    const { dispatch } = this.props;

    dispatch((_, getState) => {
      if (
        getState().Home?.mtpDevice?.info?.usbDeviceInfo?.SerialNumber !== serial
      )
        return;
      dispatch(
        actionSetMtpStatus({
          isAvailable: false,
          isLoading: false,
          error: null,
          info: {},
        })
      );
    });
  };

  handleReconnect = () => {
    const { dispatch } = this.props;

    dispatch((_, getState) => {
      if (getState().Home?.fileTransfer?.progress?.toggle) return;
      dispatch(
        initializeMtp(
          {
            filePath: '/',
            ignoreHidden: true,
            changeLegacyMtpStorageOnlyOnDeviceChange: false,
            deviceType: DEVICE_TYPE.mtp,
          },
          getState
        )
      );
    });
  };

  render() {
    const {
      classes: styles,
      mtpMode,
      mtpDevice,
      mtpStoragesList,
      transferring,
    } = this.props;
    const connected = mtpDevice.isAvailable;
    const { filesVisible, resizing } = this.state;

    return (
      <Fragment>
        <main className={styles.root}>
          <DevicePreview
            device={mtpDevice}
            storages={mtpStoragesList}
            onReconnect={this.handleReconnect}
            onDisconnected={this.handleDisconnected}
            transferring={transferring}
            filesVisible={filesVisible}
            resizing={resizing}
            onToggleFiles={this.handleToggleFiles}
          />
          <section
            id="device-files-pane"
            className={styles.filesPane}
            aria-label={mtpDevice.info?.mediaOnly ? '照片与视频' : '设备文件'}
            hidden={!filesVisible}
          >
            <header className={styles.filesHeading}>
              <div className={styles.headingLabel}>
                <h1>{mtpDevice.info?.mediaOnly ? '照片与视频' : '设备文件'}</h1>
                <span className={styles.transferHint}>
                  {mtpDevice.info?.transport === 'ios'
                    ? '照片可拖出到 Mac；App 文档支持双向传输'
                    : mtpDevice.info?.mediaOnly
                    ? '在已有相册中双向传输照片和视频；普通文件仍需 MTP'
                    : '选择文件或文件夹，拖拽即可在移动设备与 mac 之间互传'}
                </span>
              </div>
              <ToolbarAreaPane
                showMenu={false}
                deviceType={DEVICE_TYPE.mtp}
                visible={filesVisible}
              />
            </header>
            <div className={styles.browser}>
              <FileExplorer
                visible={filesVisible}
                hideColList={
                  mtpMode === MTP_MODE.legacy &&
                  !['adb', 'ios', 'hdc'].includes(mtpDevice.info?.transport)
                    ? HIDDEN_LEGACY_COLUMNS
                    : HIDDEN_KALAM_COLUMNS
                }
                deviceType={DEVICE_TYPE.mtp}
              />
              {!connected &&
                mtpDevice.info?.transport !== 'ios' &&
                !mtpDevice.error?.startsWith('iOS: ') && (
                  <div className={styles.emptyState} role="status">
                    <div className={styles.connectionGuide}>
                      <div className={styles.emptyIcon}>
                        <UsbIcon />
                      </div>
                      <h2>
                        {mtpDevice.isLoading
                          ? '正在连接设备…'
                          : '先开启 USB 调试，再连接手机'}
                      </h2>
                      <ol className={styles.connectionSteps}>
                        <li>
                          在手机「设置 → 开发者选项」中，开启
                          <strong>「USB 调试」</strong>。
                        </li>
                        <li>
                          用 USB 数据线连接电脑，解锁手机，选择「文件传输」。
                        </li>
                        <li>
                          手机弹出「允许 USB 调试？」时，点击
                          <strong>「允许」</strong>
                          ，再点击本窗口右上方的刷新按钮。
                        </li>
                      </ol>
                      <p className={styles.connectionHelp}>
                        <strong>找不到「开发者选项」？</strong>
                        在手机设置的「关于手机」或「关于本机」中，
                        连续点击「版本号」，直到提示已开启开发者模式，再返回设置查找。
                        不同手机的入口可能略有不同，请按手机提示操作。
                      </p>
                    </div>
                  </div>
                )}
            </div>
          </section>
        </main>
      </Fragment>
    );
  }
}

const mapStateToProps = (state) => ({
  transferring: Boolean(state.Home?.fileTransfer?.progress?.toggle),
  mtpMode: makeMtpMode(state),
  mtpDevice: makeMtpDevice(state),
  mtpStoragesList: makeMtpStoragesList(state),
});

export default connect(mapStateToProps)(withStyles(styles)(Home));
