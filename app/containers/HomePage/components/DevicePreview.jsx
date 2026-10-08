import React, { useEffect, useState, useRef } from 'react';
import { ipcRenderer } from 'electron';
import Switch from '@material-ui/core/Switch';
import { withStyles } from '@material-ui/core/styles';
import Button from '@material-ui/core/Button';
import ButtonBase from '@material-ui/core/ButtonBase';
import Menu from '@material-ui/core/Menu';
import MenuItem from '@material-ui/core/MenuItem';
import FullscreenIcon from '@material-ui/icons/Fullscreen';
import RefreshIcon from '@material-ui/icons/Refresh';
import FullscreenExitIcon from '@material-ui/icons/FullscreenExit';
import UsbIcon from '@material-ui/icons/Usb';
import forwardIcon from '../../../../assets/前进 forward.svg';
import dropDownIcon from '../../../../assets/向下折叠箭头 arrow-drop-down.svg';
import refreshIcon from '../../../../assets/刷新 refresh.svg';
import useDevicePreview from './useDevicePreview';
import { niceBytes } from '../../../utils/funcs';
import { styles } from '../styles/DevicePreview';

function DevicePreview({
  classes,
  device,
  storages,
  onReconnect,
  onDisconnected,
  transferring,
  filesVisible,
  resizing,
  onToggleFiles,
}) {
  const isIos = device.info?.transport === 'ios';
  const [harmonyDevice, setHarmonyDevice] = useState(null);
  const screenRef = useRef(null);
  const previewAreaRef = useRef(null);
  const [previewBounds, setPreviewBounds] = useState({
    width: 312,
    height: 600,
  });

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;

      setPreviewBounds({ width, height });
    });

    observer.observe(previewAreaRef.current);

    return () => observer.disconnect();
  }, []);
  const installBusy = useRef(false);
  const dragDepth = useRef(0);
  const [draggingApk, setDraggingApk] = useState(false);
  const [installingApk, setInstallingApk] = useState(false);
  const [installMessage, setInstallMessage] = useState('');
  const [windowState, setWindowState] = useState({
    minimized: true,
    fullscreen: false,
    previewFullscreen: false,
  });

  useEffect(() => {
    let disposed = false;
    let received = false;
    const update = (_, state) => {
      received = true;
      if (!disposed) setWindowState(state);
    };

    ipcRenderer.on('preview:window-state', update);
    ipcRenderer
      .invoke('preview:window-state')
      .then((state) => {
        if (!disposed && !received) setWindowState(state);

        return null;
      })
      .catch(() => {
        if (!disposed)
          setWindowState({
            minimized: false,
            fullscreen: false,
            previewFullscreen: false,
          });
      });

    return () => {
      disposed = true;
      ipcRenderer.removeListener('preview:window-state', update);
    };
  }, []);
  const deviceCardRef = useRef(null);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const listOpen = Boolean(menuAnchor);
  const [devices, setDevices] = useState([]);
  const [listMessage, setListMessage] = useState('');
  const [controlMessage, setControlMessage] = useState('');
  const showDevices = async (event) => {
    if (event) setMenuAnchor(deviceCardRef.current);
    setListMessage('正在查找设备…');
    if (isIos) {
      setDevices([]);
      setListMessage('iPhone 已通过 USB 连接，点击状态按钮可重新连接。');

      return;
    }

    try {
      const result = await ipcRenderer.invoke('preview:devices');

      setDevices(result.devices);
      setListMessage(
        result.error ||
          (result.devices.length
            ? ''
            : '未检测到 ADB 或 HDC 设备，请检查 USB 连接和调试授权。')
      );
    } catch (error) {
      setListMessage(error.message);
    }
  };
  const fullscreen = async () => {
    if (!canPreview || !preview) return;
    try {
      freeze();
      await ipcRenderer.invoke('preview:fullscreen', true);
      setControlMessage('');
    } catch (_) {
      setControlMessage('无法打开全屏预览，请重试');
    }
  };
  const exitFullscreen = async () => {
    try {
      freeze();
      await ipcRenderer.invoke('preview:fullscreen', false);
    } catch (_) {
      setControlMessage('无法退出全屏，请按 Esc 重试');
    }
  };
  const fileConnected = device.isAvailable;
  const isHarmony =
    device.info?.transport === 'hdc' ||
    (!fileConnected && Boolean(harmonyDevice));
  const connected = fileConnected || isHarmony;
  const [preview, setPreview] = useState(false);

  const [previewDeviceSerial, setPreviewDeviceSerial] = useState(null);
  const serial =
    device.info?.usbDeviceInfo?.SerialNumber ||
    device.info?.mtpDeviceInfo?.SerialNumber ||
    harmonyDevice?.serial;
  const canPreview = Boolean(
    connected && !isIos && serial && previewDeviceSerial === serial
  );

  useEffect(() => {
    if (!canPreview) setPreview(false);
  }, [canPreview]);
  const dropApk = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepth.current = 0;
    setDraggingApk(false);
    if (isIos || isHarmony) {
      setInstallMessage(
        isIos
          ? '请将文件拖入右侧 App 的文档目录'
          : 'HarmonyOS 不支持 Android APK 安装'
      );

      return;
    }

    if (installBusy.current) return;
    const files = Array.from(event.dataTransfer.files || []);

    if (!connected || !serial) {
      setInstallMessage('请先连接目标 Android 设备');

      return;
    }

    if (
      files.length !== 1 ||
      !/\.apk$/i.test(files[0].name) ||
      !files[0].path
    ) {
      setInstallMessage('请每次拖入一个本机 APK 文件');

      return;
    }

    installBusy.current = true;
    setInstallingApk(true);
    setInstallMessage(
      `正在向 ${model} 安装 ${files[0].name}… 请留意手机上的确认提示`
    );
    try {
      const result = await ipcRenderer.invoke(
        'preview:install-apk',
        serial,
        files[0].path
      );

      setInstallMessage(
        result.error
          ? `安装失败：${result.error}`
          : `${result.name} 已安装到 ${model}`
      );
    } catch (error) {
      setInstallMessage(`安装失败：${error.message}`);
    } finally {
      installBusy.current = false;
      setInstallingApk(false);
    }
  };
  const [display, setDisplay] = useState(null);
  const { canvas, snapshot, freeze, message, frameSize } = useDevicePreview(
    preview && canPreview && !windowState.minimized,
    serial,
    () => setPreview(false),
    windowState.fullscreen || windowState.previewFullscreen ? 'high' : 'eco',
    display,
    display?.transport || (isHarmony ? 'hdc' : 'adb')
  );

  useEffect(() => {
    if (fileConnected || isIos) {
      setHarmonyDevice(null);

      return undefined;
    }

    let disposed = false;
    let timer;
    const check = async () => {
      try {
        const result = await ipcRenderer.invoke('preview:devices');

        if (!disposed)
          setHarmonyDevice(
            result.devices?.find((item) => item.transport === 'hdc') || null
          );
      } catch (_) {
        if (!disposed) setHarmonyDevice(null);
      }

      if (!disposed) timer = setTimeout(check, 3000);
    };

    check();

    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [fileConnected, isIos]);

  useEffect(() => {
    setDisplay(null);
    setPreviewDeviceSerial(null);
  }, [connected, serial, isIos]);
  useEffect(() => {
    if (!connected || !serial || isIos || windowState.minimized)
      return undefined;
    let disposed = false;
    let timer;
    const updateDisplay = async () => {
      try {
        const size = await ipcRenderer.invoke('preview:display-size', serial);

        if (!disposed) setPreviewDeviceSerial(size ? serial : null);
        if (!disposed && size)
          setDisplay((previous) =>
            previous?.width === size.width && previous?.height === size.height
              ? previous
              : size
          );
      } catch (_) {
        // Retain the ratio, but disable controls until ADB is available again.
        if (!disposed) setPreviewDeviceSerial(null);
      }

      if (!disposed) timer = setTimeout(updateDisplay, 2000);
    };

    updateDisplay();

    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [connected, serial, isIos, windowState.minimized]);
  useEffect(() => {
    if (
      !connected ||
      !serial ||
      !['adb', 'ios'].includes(device.info?.transport)
    )
      return undefined;
    let disposed = false;
    let timer;
    const check = async () => {
      try {
        const result = isIos
          ? await ipcRenderer.invoke('ios-files:request', {
              operation: 'devices',
            })
          : await ipcRenderer.invoke('preview:devices');
        const present = isIos
          ? result.data?.includes(serial)
          : result.devices?.some(
              (item) => item.serial === serial && item.status === 'device'
            );

        if (!disposed && !result.error && !present) {
          onDisconnected(serial);

          return;
        }
      } catch (_) {
        /* A failed check is not evidence of a disconnect. */
      }

      if (!disposed) timer = setTimeout(check, 1000);
    };

    timer = setTimeout(check, 1000);

    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [connected, serial, isIos, device.info?.transport, onDisconnected]);

  const natural = (preview && frameSize) ||
    display || { width: 1080, height: 2400 };
  const scale = Math.max(
    0,
    Math.min(
      previewBounds.width / natural.width,
      previewBounds.height / natural.height
    )
  );
  const width = natural.width * scale;
  const height = natural.height * scale;

  useEffect(() => {
    if (!connected) setPreview(false);
    if ((!connected || !preview) && windowState.previewFullscreen)
      ipcRenderer.invoke('preview:fullscreen', false).catch(() => {});
  }, [connected, preview, windowState.previewFullscreen]);
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape' && windowState.previewFullscreen) {
        event.preventDefault();
        ipcRenderer.invoke('preview:fullscreen', false).catch(() => {});
      }
    };

    document.addEventListener('keydown', onKey);

    return () => document.removeEventListener('keydown', onKey);
  }, [windowState.previewFullscreen]);
  const info = fileConnected ? device.info?.mtpDeviceInfo : null;
  const model =
    info?.Model ||
    harmonyDevice?.model ||
    (connected ? 'Android 设备' : '等待设备连接');
  const storage = fileConnected
    ? Object.values(storages).find((s) => s.selected)
    : null;
  const capacity = Number(storage?.info?.MaxCapability);
  const free = Number(storage?.info?.FreeSpaceInBytes);
  const hasCapacity =
    Number.isFinite(capacity) &&
    capacity > 0 &&
    Number.isFinite(free) &&
    free >= 0 &&
    free <= capacity;
  const used = hasCapacity ? capacity - free : 0;
  const status = device.isLoading
    ? '正在连接'
    : connected
    ? '已连接'
    : '未连接';

  return (
    <aside
      className={classes.root}
      aria-label="设备预览"
      onDragEnter={(event) => {
        event.preventDefault();
        event.stopPropagation();
        dragDepth.current += 1;
        if (!isIos && !isHarmony) setDraggingApk(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const { dataTransfer } = event;

        dataTransfer.dropEffect =
          connected && !isIos && !isHarmony && !installBusy.current
            ? 'copy'
            : 'none';
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        event.stopPropagation();
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (!dragDepth.current) setDraggingApk(false);
      }}
      onDrop={dropApk}
    >
      <div className={classes.topDragArea} aria-hidden="true" />
      <div ref={previewAreaRef} className={classes.deviceArea}>
        <div
          ref={screenRef}
          className={`${classes.screen} ${
            windowState.previewFullscreen ? classes.fullscreenScreen : ''
          }`}
          style={{ width, height }}
        >
          {preview ? (
            <>
              <canvas
                ref={canvas}
                className={classes.liveCanvas}
                style={{
                  objectFit:
                    isHarmony ||
                    (frameSize &&
                      frameSize.width > frameSize.height !== width > height)
                      ? 'contain'
                      : 'cover',
                }}
                aria-label="设备实时画面"
              />
              <canvas
                ref={snapshot}
                className={classes.liveCanvas}
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  inset: 0,
                  visibility: 'hidden',
                  pointerEvents: 'none',
                  objectFit:
                    isHarmony ||
                    (frameSize &&
                      frameSize.width > frameSize.height !== width > height)
                      ? 'contain'
                      : 'cover',
                }}
              />
            </>
          ) : (
            <>
              <UsbIcon className={classes.usbIcon} />
              <span>
                {isIos ? 'iPhone' : isHarmony ? 'HarmonyOS' : 'Android'}
              </span>
              <small>
                {isIos
                  ? 'USB 文件共享'
                  : connected
                  ? 'USB 已连接'
                  : '通过 USB 连接'}
              </small>
            </>
          )}
          {(controlMessage ||
            (message &&
              message !== '实时画面' &&
              (preview || message !== '正在连接实时画面…'))) && (
            <p className={classes.previewMessage} role="status">
              {controlMessage || message}
            </p>
          )}
          {(draggingApk || installMessage) && (
            <div
              className={classes.installMessage}
              role="status"
              aria-live="polite"
              aria-busy={installingApk}
            >
              {draggingApk
                ? installingApk
                  ? '正在安装，请稍候…'
                  : connected
                  ? '松开以安装 APK 到当前设备'
                  : '请先连接 Android 设备'
                : installMessage}
              {!draggingApk && !installingApk && (
                <Button onClick={() => setInstallMessage('')}>知道了</Button>
              )}
            </div>
          )}
          <Button className={classes.exitFullscreen} onClick={exitFullscreen}>
            <FullscreenExitIcon />
            退出全屏
          </Button>
        </div>
      </div>
      <div className={classes.bottomInfo}>
        <div className={classes.deviceInfo}>
          <div className={classes.actions}>
            <label
              className={classes.previewToggle}
              data-disabled={!canPreview}
            >
              <span>预览</span>
              <Switch
                size="small"
                color="secondary"
                checked={preview}
                disabled={!canPreview}
                onChange={(_, checked) => setPreview(checked)}
                inputProps={{ 'aria-label': '实时投屏预览' }}
              />
            </label>
            <Button
              onClick={fullscreen}
              disabled={!preview || !canPreview}
              title="全屏预览，按 Esc 退出"
            >
              <FullscreenIcon />
              全屏
            </Button>
          </div>
          <div ref={deviceCardRef} className={classes.infoRow}>
            <h2 className={classes.model}>
              <Button
                className={classes.devicePicker}
                onClick={showDevices}
                aria-label={`${model}，打开设备列表`}
                aria-haspopup="menu"
                aria-expanded={listOpen}
              >
                <span className={classes.deviceName} title={model}>
                  {model}
                </span>
                <img
                  className={classes.devicePickerIcon}
                  src={dropDownIcon}
                  alt=""
                />
              </Button>
            </h2>
            <Button
              className={classes.status}
              disabled={transferring || device.isLoading}
              title="重新连接设备"
              aria-label={`${status}，点击重新连接`}
              onClick={() => {
                setPreview(false);
                onReconnect();
              }}
            >
              <span
                className={classes.dot}
                style={{ background: connected ? '#269b69' : '#9aa2af' }}
              />
              {status}
              <img className={classes.reconnectIcon} src={refreshIcon} alt="" />
            </Button>
          </div>
        </div>
        <ButtonBase
          component="div"
          className={classes.storage}
          onClick={onToggleFiles}
          aria-disabled={resizing}
          aria-label={
            isIos ? '照片与文件' : isHarmony ? '照片与视频' : '存储空间'
          }
          aria-expanded={filesVisible}
          aria-controls="device-files-pane"
          title={filesVisible ? '点击隐藏设备文件' : '点击显示设备文件'}
        >
          <div className={classes.storageTitle}>
            {isIos ? '照片与文件' : isHarmony ? '照片与视频' : '存储空间'}
            <img className={classes.storageForward} src={forwardIcon} alt="" />
          </div>
          {hasCapacity ? (
            <>
              <div className={classes.capacity}>
                <strong>{niceBytes(used)}</strong>
                <span> / {niceBytes(capacity)}</span>
              </div>
              <progress
                className={classes.progress}
                value={used}
                max={capacity}
                aria-label="已用存储空间"
              />
              <p>可用空间 {niceBytes(free)}</p>
            </>
          ) : (
            <p>
              {isIos
                ? '照片与视频 · App 文档'
                : isHarmony
                ? 'HDC 相册媒体 · 普通文件需 MTP'
                : connected
                ? '存储容量暂不可用'
                : '连接后显示存储空间'}
            </p>
          )}
        </ButtonBase>
      </div>
      <Menu
        anchorEl={menuAnchor}
        open={listOpen}
        onClose={() => setMenuAnchor(null)}
        getContentAnchorEl={null}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        PaperProps={{ className: classes.deviceMenu }}
        MenuListProps={{ 'aria-label': '设备列表' }}
      >
        {listMessage && (
          <MenuItem disabled className={classes.menuMessage}>
            {listMessage}
          </MenuItem>
        )}
        {devices.map((item) => (
          <MenuItem
            key={item.serial}
            selected={item.serial === serial}
            disabled={
              item.status !== 'device' || (connected && item.serial !== serial)
            }
            onClick={() => {
              setMenuAnchor(null);
              if (!connected) onReconnect();
            }}
          >
            <div className={classes.deviceListItem}>
              <strong>
                {item.model}
                {item.serial === serial ? ' · 当前设备' : ''}
              </strong>
              <span>
                {
                  {
                    device: '已连接',
                    unauthorized: '请允许 USB 调试',
                    offline: '设备离线',
                  }[item.status]
                }
              </span>
            </div>
          </MenuItem>
        ))}
        <MenuItem onClick={() => showDevices()}>
          <RefreshIcon fontSize="small" />
          刷新设备列表
        </MenuItem>
      </Menu>
    </aside>
  );
}

export default withStyles(styles)(DevicePreview);
