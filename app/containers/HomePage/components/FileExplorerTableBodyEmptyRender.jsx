import React, { PureComponent } from 'react';
import { ipcRenderer } from 'electron';
import { withStyles } from '@material-ui/core/styles';
import TableCell from '@material-ui/core/TableCell';
import TableRow from '@material-ui/core/TableRow';
import CircularProgress from '@material-ui/core/CircularProgress';
import Collapse from '@material-ui/core/Collapse';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ToggleOffIcon from '@material-ui/icons/ToggleOff';
import ListItemIcon from '@material-ui/core/ListItemIcon';
import ListItemText from '@material-ui/core/ListItemText';
import Divider from '@material-ui/core/Divider';
import KeyboardIcon from '@material-ui/icons/Keyboard';
import StarRateIcon from '@material-ui/icons/StarRate';
import WarningIcon from '@material-ui/icons/Warning';
import CloseIcon from '@material-ui/icons/Close';
import LockOpenIcon from '@material-ui/icons/LockOpen';
import UsbIcon from '@material-ui/icons/Usb';
import TouchAppIcon from '@material-ui/icons/TouchApp';
import RadioButtonCheckedIcon from '@material-ui/icons/RadioButtonChecked';
import CachedIcon from '@material-ui/icons/Cached';
import PermDeviceInformationIcon from '@material-ui/icons/PermDeviceInformation';
import SettingsInputHdmiIcon from '@material-ui/icons/SettingsInputHdmi';
import ExpandLessIcon from '@material-ui/icons/ExpandLess';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import Paper from '@material-ui/core/Paper';
import Button from '@material-ui/core/Button';
import { styles } from '../styles/FileExplorerTableBodyEmptyRender';
import KeyboadShortcuts from '../../KeyboardShortcutsPage/components/KeyboadShortcuts';
import Features from '../../Onboarding/components/Features';
import { helpPhoneNotConnecting } from '../../../templates/fileExplorer';
import { analyticsService } from '../../../services/analytics';
import { EVENT_TYPE } from '../../../enums/events';
import { IpcEvents } from '../../../services/ipc-events/IpcEventType';
import { APP_NAME } from '../../../constants/meta';
import { openExternalUrl } from '../../../utils/url';

class FileExplorerTableBodyEmptyRender extends PureComponent {
  constructor(props) {
    super(props);

    this.state = {
      expansionPanel: {
        noMtpInstructions: true,
        keyboardNavigation: false,
        features: false,
      },
    };
  }

  _handleExpansionPanel = ({ key }) => {
    this.setState((prevState) => {
      return {
        expansionPanel: {
          ...prevState.expansionPanel,
          [key]: !prevState.expansionPanel[key],
        },
      };
    });
  };

  _handleHelpPhoneNotRecognizedBtn = () => {
    ipcRenderer.send(IpcEvents.OPEN_HELP_PHONE_NOT_CONNECTING_WINDOW);

    analyticsService.sendEvent(
      EVENT_TYPE.MTP_HELP_PHONE_NOT_CONNECTED_DIALOG_OPEN,
      {}
    );
  };

  render() {
    const {
      columnCount,
      classes: styles,
      mtpDevice,
      isMtp,
      currentBrowsePath,
      deviceType,
      directoryLists,
      onContextMenuClick,
    } = this.props;

    const { expansionPanel } = this.state;

    const _eventTarget = 'emptyRowTarget';

    const tableData = {
      path: currentBrowsePath[deviceType],
      directoryLists: directoryLists[deviceType],
    };

    const isIos =
      isMtp &&
      (mtpDevice.info?.transport === 'ios' ||
        mtpDevice.error?.startsWith('iOS: '));

    if (isIos) {
      const loading = mtpDevice.isLoading;
      const unavailable = !mtpDevice.isAvailable;
      const { directoryError } = mtpDevice;
      const photos = currentBrowsePath[deviceType] === '/@photos';
      const appRoot = currentBrowsePath[deviceType] === '/';
      const title = loading
        ? '正在读取设备目录…'
        : unavailable
        ? '暂时无法连接 iPhone'
        : directoryError
        ? photos
          ? '暂时无法读取照片'
          : '无法查看此 App 的文档'
        : appRoot
        ? '未发现支持文件共享的 App'
        : photos
        ? '没有可导入的照片或视频'
        : '此文件夹为空';
      const description = loading
        ? ''
        : unavailable
        ? '请检查 USB 连接，解锁 iPhone 并信任此电脑，然后点击重新连接。'
        : directoryError
        ? /InstallationLookupFailed|无法访问 App 文档/.test(directoryError)
          ? '此 App 暂不允许访问共享文档。请返回上级选择其他 App，或在手机上打开此 App 后重试。'
          : directoryError.replace(/^iOS: /, '')
        : appRoot
        ? '需要已有 App 开放文件共享，才能在这里查看文档。'
        : photos
        ? '请解锁 iPhone 并信任此电脑，再刷新列表。这里只显示设备允许导入的照片与视频。'
        : '将 Mac 上的文件或文件夹拖到这里，即可复制到 iPhone。';

      return (
        <TableRow className={styles.emptyTableRowWrapper}>
          <TableCell
            colSpan={columnCount}
            className={styles.tableCell}
            onContextMenu={(event) =>
              onContextMenuClick(event, {}, { ...tableData }, _eventTarget)
            }
          >
            <div
              className={`${styles.contentMessage} ${
                loading ? styles.loadingMessage : ''
              }`}
              role="status"
              aria-live="polite"
            >
              {loading && (
                <CircularProgress
                  size={28}
                  thickness={4}
                  className={styles.loadingIcon}
                  aria-label="正在读取设备目录"
                />
              )}
              <p className={styles.contentTitle}>{title}</p>
              {description && (
                <p className={styles.contentDescription}>{description}</p>
              )}
            </div>
          </TableCell>
        </TableRow>
      );
    }

    if (isMtp && mtpDevice.isLoading) {
      return (
        <TableRow className={styles.emptyTableRowWrapper}>
          <TableCell colSpan={columnCount} className={styles.tableCell}>
            <div
              className={`${styles.contentMessage} ${styles.loadingMessage}`}
              role="status"
              aria-live="polite"
            >
              <CircularProgress
                size={28}
                thickness={4}
                className={styles.loadingIcon}
                aria-label="正在读取设备目录"
              />
              <p className={styles.contentTitle}>正在读取设备目录…</p>
            </div>
          </TableCell>
        </TableRow>
      );
    }

    if (isMtp && !mtpDevice.isAvailable) {
      return (
        <TableRow className={styles.emptyTableRowWrapper}>
          <TableCell colSpan={columnCount} className={styles.tableCell}>
            <Paper style={{ height: `100%` }} elevation={0}>
              <Button
                className={styles.helpPhoneNotRecognized}
                onClick={() => {
                  this._handleHelpPhoneNotRecognizedBtn();
                }}
              >
                {helpPhoneNotConnecting}
              </Button>

              <List>
                <ListItem
                  button
                  onClick={() =>
                    this._handleExpansionPanel({
                      key: 'noMtpInstructions',
                    })
                  }
                >
                  <ListItemIcon>
                    <WarningIcon color="error" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Android device is either busy or not connected"
                    secondary={
                      !expansionPanel.noMtpInstructions
                        ? 'Click here for the instructions'
                        : 'Click here to hide the instructions'
                    }
                  />
                  {expansionPanel.noMtpInstructions ? (
                    <ExpandLessIcon />
                  ) : (
                    <ExpandMoreIcon />
                  )}
                </ListItem>
                <Collapse
                  in={expansionPanel.noMtpInstructions}
                  timeout="auto"
                  unmountOnExit
                >
                  <List component="div" disablePadding>
                    <div className={styles.nestedPanel}>
                      <ListItem>
                        <ListItemIcon>
                          <CloseIcon />
                        </ListItemIcon>
                        <ListItemText
                          primary="Quit Google Drive, Android File Transfer, Dropbox, OneDrive, Preview (for macOS Ventura or newer) or any other app that might be reading USB"
                          secondary={
                            <span>
                              {`Uninstall 'Android File Transfer' by Google if it
                              keeps popping up every time you connect your
                              Android device. The most recent versions of Google
                              Drive and Dropbox are known to interfere with ${APP_NAME}. Completely quitting these apps may fix
                              this issue. `}
                              <a
                                onClick={(events) => {
                                  openExternalUrl(
                                    'https://github.com/ganeshrvel/openmtp/issues/276',
                                    events
                                  );
                                }}
                              >
                                Read more...
                              </a>
                            </span>
                          }
                        />
                      </ListItem>

                      <ListItem>
                        <ListItemIcon>
                          <ToggleOffIcon />
                        </ListItemIcon>
                        <ListItemText
                          primary={`If you face frequent device disconnections, turn off 'USB Hotplug'`}
                          secondary={`Settings > General Tab`}
                        />
                      </ListItem>

                      <ListItem>
                        <ListItemIcon>
                          <LockOpenIcon />
                        </ListItemIcon>
                        <ListItemText primary="Unlock your Android device" />
                      </ListItem>
                      <ListItem>
                        <ListItemIcon>
                          <UsbIcon />
                        </ListItemIcon>
                        <ListItemText primary="With a USB cable, connect your device to your computer" />
                      </ListItem>
                      <ListItem>
                        <ListItemIcon>
                          <TouchAppIcon />
                        </ListItemIcon>
                        <ListItemText
                          primary="On your device, tap the 'Charging this device via
                  USB' notification"
                        />
                      </ListItem>
                      <ListItem>
                        <ListItemIcon>
                          <RadioButtonCheckedIcon />
                        </ListItemIcon>
                        <ListItemText primary="Under 'Use USB for' select File Transfer" />
                      </ListItem>
                      <ListItem>
                        <ListItemIcon>
                          <CachedIcon />
                        </ListItemIcon>
                        <ListItemText primary="Tap on the 'Refresh' button above" />
                      </ListItem>
                      <ListItem>
                        <ListItemIcon>
                          <PermDeviceInformationIcon />
                        </ListItemIcon>
                        <ListItemText
                          primary="If you are trying to connect a SAMSUNG device then accept the 'Allow access to device data' confirmation pop-up in your phone"
                          secondary="Tap on the 'Refresh' button again. Reconnect your phone and repeat the above steps if it doesn't help"
                        />
                      </ListItem>
                      <ListItem>
                        <ListItemIcon>
                          <SettingsInputHdmiIcon />
                        </ListItemIcon>
                        <ListItemText primary="Reconnect the cable and repeat the above steps if you keep seeing this message" />
                      </ListItem>
                    </div>
                  </List>
                </Collapse>

                <Divider className={styles.divider} />

                <ListItem
                  button
                  onClick={() =>
                    this._handleExpansionPanel({
                      key: 'keyboardNavigation',
                    })
                  }
                >
                  <ListItemIcon>
                    <KeyboardIcon />
                  </ListItemIcon>
                  <ListItemText
                    primary="Keyboard Shortcuts"
                    secondary={
                      expansionPanel.keyboardNavigation
                        ? 'Click here to hide the shortcuts'
                        : 'Click here to view the shortcuts'
                    }
                  />
                  {expansionPanel.keyboardNavigation ? (
                    <ExpandLessIcon />
                  ) : (
                    <ExpandMoreIcon />
                  )}
                </ListItem>
                <Collapse
                  in={expansionPanel.keyboardNavigation}
                  timeout="auto"
                  unmountOnExit
                >
                  <List component="div" disablePadding>
                    <ListItem>
                      <div className={styles.nestedPanel}>
                        <KeyboadShortcuts />
                      </div>
                    </ListItem>
                  </List>
                </Collapse>

                <Divider className={styles.divider} />

                <ListItem
                  button
                  onClick={() =>
                    this._handleExpansionPanel({
                      key: 'features',
                    })
                  }
                >
                  <ListItemIcon>
                    <StarRateIcon />
                  </ListItemIcon>
                  <ListItemText
                    primary="Features"
                    secondary={
                      expansionPanel.features
                        ? 'Click here to hide the available features'
                        : 'Click here to view the available features'
                    }
                  />
                  {expansionPanel.features ? (
                    <ExpandLessIcon />
                  ) : (
                    <ExpandMoreIcon />
                  )}
                </ListItem>
                <Collapse
                  in={expansionPanel.features}
                  timeout="auto"
                  unmountOnExit
                >
                  <div className={styles.nestedPanel}>
                    <Features hideTitle />
                  </div>
                </Collapse>
              </List>
            </Paper>
          </TableCell>
        </TableRow>
      );
    }

    return (
      <TableRow className={styles.emptyTableRowWrapper}>
        <TableCell
          colSpan={columnCount}
          className={styles.tableCell}
          onContextMenu={(event) =>
            onContextMenuClick(event, {}, { ...tableData }, _eventTarget)
          }
        />
      </TableRow>
    );
  }
}

export default withStyles(styles)(FileExplorerTableBodyEmptyRender);
