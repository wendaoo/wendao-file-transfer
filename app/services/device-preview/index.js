/* eslint no-await-in-loop: off, no-param-reassign: off, no-bitwise: off */
import { app, ipcMain, BrowserWindow } from 'electron';
import { execFile, spawn } from 'child_process';
import { existsSync, promises as fs } from 'fs';
import { homedir, tmpdir } from 'os';
import path from 'path';
import net from 'net';
import { randomBytes } from 'crypto';
import { promisify } from 'util';
import { rootPath } from 'electron-root-path';
import VideoPackets from './VideoPackets';
import installApk from './installApk';

const execute = promisify(execFile);
const sessions = new Map();
const harmonyModels = new Map();
const version = '3.3.4';
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function findAdb() {
  const candidates = [
    process.env.OPENMTP_ADB_PATH,
    path.join(rootPath, 'Contents/Resources/adb/adb'),
    path.join(rootPath, 'tools/adb/adb'),
    process.env.ANDROID_HOME &&
      path.join(process.env.ANDROID_HOME, 'platform-tools/adb'),
    path.join(homedir(), 'Library/Android/sdk/platform-tools/adb'),
    '/opt/homebrew/bin/adb',
    '/usr/local/bin/adb',
    ...(process.env.PATH || '')
      .split(path.delimiter)
      .map((p) => path.join(p, 'adb')),
  ];

  return candidates.find((p) => p && existsSync(p));
}

export function findHdc() {
  const hdcArch = process.arch === 'arm64' ? 'arm64' : 'x86_64';
  const candidates = [
    process.env.OPENMTP_HDC_PATH,
    path.join(rootPath, 'Contents/Resources/hdc/hdc'),
    path.join(rootPath, 'tools/hdc', `hdc_${hdcArch}`),
    path.join(
      homedir(),
      'Library/Application Support/COUI Local Assistant/harmony-command-line-tools/x86_64/hdc'
    ),
    path.join(homedir(), 'Library/Huawei/Sdk/hmscore/3.1.0/toolchains/hdc'),
    '/opt/homebrew/bin/hdc',
    '/usr/local/bin/hdc',
    ...(process.env.PATH || '')
      .split(path.delimiter)
      .map((p) => path.join(p, 'hdc')),
  ];

  return candidates.find((p) => p && existsSync(p));
}

async function harmonyDevices() {
  const binary = findHdc();

  if (!binary) return [];
  const { stdout } = await execute(binary, ['list', 'targets', '-v'], {
    timeout: 6000,
  });

  const connected = stdout
    .split('\n')
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts.length >= 3 && parts[2] === 'Connected')
    .map(([serial]) => serial);

  return Promise.all(
    connected.map(async (serial) => {
      if (!harmonyModels.has(serial)) {
        const result = await execute(
          binary,
          ['-t', serial, 'shell', 'param get const.product.model'],
          { timeout: 3000 }
        ).catch(() => null);

        harmonyModels.set(serial, result?.stdout?.trim() || 'HarmonyOS 设备');
      }

      return {
        serial,
        status: 'device',
        model: harmonyModels.get(serial),
        transport: 'hdc',
      };
    })
  );
}

async function captureHarmonyFrame(session) {
  const remote = `/data/local/tmp/openmtp-preview-${session.id}.jpeg`;
  const local = path.join(tmpdir(), `openmtp-preview-${session.id}.jpeg`);

  try {
    await execute(
      session.hdc,
      ['-t', session.serial, 'shell', `snapshot_display -f ${remote}`],
      { timeout: 12000 }
    );
    assertActive(session);
    await execute(
      session.hdc,
      ['-t', session.serial, 'file', 'recv', remote, local],
      { timeout: 12000 }
    );
    assertActive(session);
    const jpeg = await fs.readFile(local);

    if (jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8)
      throw new Error('设备没有返回有效的屏幕画面');
    send(session, 'preview:jpeg', jpeg);
  } finally {
    await fs.unlink(local).catch(() => {});
    await execute(
      session.hdc,
      ['-t', session.serial, 'shell', `rm -f ${remote}`],
      { timeout: 5000 }
    ).catch(() => {});
  }
}

async function startHarmony(owner, serial, quality) {
  const stopping = stop(sessions.get(owner.id));
  const session = {
    owner,
    serial,
    quality,
    hdc: findHdc(),
    stopped: false,
    id: randomBytes(8).toString('hex'),
  };

  session.cleanup = () => {
    stop(session).catch(() => {});
  };

  sessions.set(owner.id, session);
  owner.once('destroyed', session.cleanup);
  owner.on('did-start-navigation', session.cleanup);
  owner.once('render-process-gone', session.cleanup);
  try {
    await stopping;
    if (
      !session.hdc ||
      !(await harmonyDevices()).some((d) => d.serial === serial)
    )
      throw new Error('未找到已授权的 HarmonyOS 设备');
    session.loop = (async () => {
      while (!session.stopped) {
        try {
          await captureHarmonyFrame(session);
          session.failures = 0;
        } catch (error) {
          if (session.stopped) break;
          session.failures = (session.failures || 0) + 1;
          if (session.failures >= 2) {
            send(session, 'preview:status', { error: error.message });
            session.cleanup();
            break;
          }
        }

        await pause(400);
      }
    })();

    return { ok: true };
  } catch (error) {
    await stop(session);

    return { error: error.message };
  }
}

async function adb(session, args) {
  return execute(session.adb, ['-s', session.serial, ...args], {
    timeout: 10000,
    maxBuffer: 1024 * 1024,
  });
}

function send(session, channel, data) {
  if (!session.stopped && !session.owner.isDestroyed())
    session.owner.send(channel, data);
}

async function stop(session) {
  if (!session) return;
  session.stopped = true;
  clearTimeout(session.watchdog);
  session.socket?.destroy();
  session.process?.kill();
  session.owner.removeListener('destroyed', session.cleanup);
  session.owner.removeListener('did-start-navigation', session.cleanup);
  session.owner.removeListener('render-process-gone', session.cleanup);
  if (sessions.get(session.owner.id) === session)
    sessions.delete(session.owner.id);
  if (session.port) {
    await adb(session, ['forward', '--remove', `tcp:${session.port}`]).catch(
      () => {}
    );
    session.port = null;
  }

  if (session.remote)
    await adb(session, ['shell', 'rm', '-f', session.remote]).catch(() => {});
}

function assertActive(session) {
  if (session.stopped) throw new Error('预览已关闭');
}

async function connectVideo(session) {
  const deadline = Date.now() + 10000;

  while (Date.now() < deadline) {
    assertActive(session);
    const connection = await new Promise((resolve) => {
      const socket = net.createConnection({
        host: '127.0.0.1',
        port: session.port,
      });
      let settled = false;
      const fail = () => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve(null);
      };

      socket.setTimeout(500, fail);
      socket.once('error', fail);
      socket.once('close', fail);
      socket.once('data', (data) => {
        if (settled) return;
        settled = true;
        socket.pause();
        socket.setTimeout(0);
        socket.removeListener('timeout', fail);
        socket.removeListener('error', fail);
        socket.removeListener('close', fail);
        resolve({ socket, initial: data.subarray(1) });
      });
    });

    if (connection) return connection;
    await pause(150);
  }

  throw new Error('投屏连接超时，请解锁手机后重试');
}

async function start(owner, serial, quality) {
  if (BrowserWindow.fromWebContents(owner)?.isMinimized())
    return { paused: true };
  const stopping = stop(sessions.get(owner.id));
  const session = {
    owner,
    serial,
    quality,
    adb: findAdb(),
    stopped: false,
    pending: 0,
  };

  session.cleanup = () => {
    stop(session).catch(() => {});
  };

  sessions.set(owner.id, session);
  owner.once('destroyed', session.cleanup);
  owner.on('did-start-navigation', session.cleanup);
  owner.once('render-process-gone', session.cleanup);
  try {
    await stopping;
    assertActive(session);
    if (!session.adb)
      throw new Error('未找到 ADB，请安装 Android Platform Tools 后重试');
    const { stdout } = await execute(session.adb, ['devices'], {
      timeout: 10000,
    });
    const devices = stdout
      .split('\n')
      .map((line) => line.trim().split(/\s+/))
      .filter((parts) => parts.length === 2);
    const selected = serial
      ? devices.find((d) => d[0] === serial)
      : devices.filter((d) => d[1] === 'device').length === 1 &&
        devices.find((d) => d[1] === 'device');

    if (selected?.[1] === 'unauthorized')
      throw new Error('请在手机上允许这台电脑进行 USB 调试');
    if (!selected || selected[1] !== 'device')
      throw new Error('请为当前手机开启 USB 调试并授权此电脑后重试');
    [session.serial] = selected;
    assertActive(session);
    const server = app.isPackaged
      ? path.join(process.resourcesPath, 'mirror', `scrcpy-server-v${version}`)
      : path.join(rootPath, 'build/mirror', `scrcpy-server-v${version}`);

    if (!existsSync(server)) throw new Error('缺少投屏组件，请重新安装应用');
    const id = (randomBytes(4).readUInt32BE(0) & 0x7fffffff)
      .toString(16)
      .padStart(8, '0');

    session.remote = `/data/local/tmp/openmtp-preview-${id}.jar`;
    await adb(session, ['push', server, session.remote]);
    assertActive(session);
    const forwarded = await adb(session, [
      'forward',
      'tcp:0',
      `localabstract:scrcpy_${id}`,
    ]);

    session.port = Number(forwarded.stdout.trim());
    assertActive(session);
    session.process = spawn(
      session.adb,
      [
        '-s',
        session.serial,
        'shell',
        `CLASSPATH=${session.remote}`,
        'app_process',
        '/',
        'com.genymobile.scrcpy.Server',
        version,
        `scid=${id}`,
        'log_level=error',
        'audio=false',
        'control=false',
        'video_codec=h264',
        quality === 'high' ? 'max_size=0' : 'max_size=1200',
        quality === 'high' ? 'max_fps=30' : 'max_fps=15',
        quality === 'high'
          ? 'video_bit_rate=12000000'
          : 'video_bit_rate=4000000',
        'tunnel_forward=true',
        'send_device_meta=false',
        'send_codec_meta=false',
        'send_frame_meta=true',
        'cleanup=false',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
    let serverLog = '';
    const captureLog = (data) => {
      serverLog = (serverLog + data.toString()).slice(-2000);
    };

    session.process.stdout.on('data', captureLog);
    session.process.stderr.on('data', captureLog);
    const fail = (message) => {
      send(session, 'preview:status', { error: message });
      session.cleanup();
    };

    session.process.on('error', () => fail('无法启动投屏服务，请重试'));
    session.process.on('exit', () => {
      if (!session.stopped) {
        console.error('Device preview server exited:', serverLog);
        fail('投屏连接已结束，请重新开启预览');
      }
    });
    const { socket, initial } = await connectVideo(session);

    session.socket = socket;
    assertActive(session);
    const parser = new VideoPackets((packet) => {
      if (session.pending >= 12) {
        fail('预览处理过慢，请关闭后重试');

        return;
      }

      session.pending += 1;
      send(session, 'preview:packet', packet);
      clearTimeout(session.watchdog);
    });
    const receive = (data) => {
      try {
        parser.push(data);
      } catch (e) {
        fail(e.message);
      }
    };

    socket.on('data', receive);
    socket.on('error', () => fail('设备连接已断开'));
    socket.on('close', () => {
      if (!session.stopped) fail('设备连接已断开');
    });
    session.watchdog = setTimeout(
      () => fail('未收到设备画面，请解锁手机后重试'),
      15000
    );
    receive(initial);
    socket.resume();

    return { ok: true };
  } catch (e) {
    await stop(session);

    return { error: e.message };
  }
}

export function registerDevicePreview() {
  const previewWindows = new WeakMap();
  const windowBackgrounds = new WeakMap();
  const windowState = (window) => ({
    minimized: window.isMinimized(),
    fullscreen: window.isFullScreen(),
    previewFullscreen: Boolean(previewWindows.get(window)),
  });
  const notifyWindow = (window) => {
    if (!window.isDestroyed() && !window.webContents.isDestroyed())
      window.webContents.send('preview:window-state', windowState(window));
  };

  app.on('browser-window-created', (_, window) => {
    const transition = (active) => {
      if (!window.webContents.isDestroyed())
        window.webContents.send('preview:transition', active);
    };

    window.on('will-enter-full-screen', () => transition(true));
    window.on('will-leave-full-screen', () => transition(true));
    window.on('enter-full-screen', () => transition(false));
    window.on('leave-full-screen', () => transition(false));
    window.on('minimize', () => {
      stop(sessions.get(window.webContents.id)).catch(() => {});
      notifyWindow(window);
    });
    window.on('restore', () => notifyWindow(window));
    window.on('enter-full-screen', () => notifyWindow(window));
    window.on('leave-full-screen', () => notifyWindow(window));
  });
  ipcMain.handle('preview:window-state', ({ sender }) => {
    const window = BrowserWindow.fromWebContents(sender);

    return window
      ? windowState(window)
      : { minimized: true, fullscreen: false, previewFullscreen: false };
  });
  ipcMain.handle('preview:fullscreen', ({ sender }, enabled) => {
    const window = BrowserWindow.fromWebContents(sender);

    if (!window || typeof enabled !== 'boolean')
      throw new Error('窗口状态无效');
    if (enabled && !previewWindows.get(window)) {
      windowBackgrounds.set(window, window.getBackgroundColor());
      // macOS exposes the native backing surface during its fullscreen animation.
      window.setBackgroundColor('#101217');
    } else if (!enabled && windowBackgrounds.has(window)) {
      const restoreBackground = () => {
        if (!window.isDestroyed() && !previewWindows.get(window)) {
          window.setBackgroundColor(windowBackgrounds.get(window));
          windowBackgrounds.delete(window);
        }
      };

      if (window.isFullScreen())
        window.once('leave-full-screen', restoreBackground);
      else setImmediate(restoreBackground);
    }

    previewWindows.set(window, enabled);
    window.setFullScreenable(true);
    // Expand inside the window first; the native green button controls macOS fullscreen.
    if (!enabled && window.isFullScreen()) window.setFullScreen(false);
    notifyWindow(window);

    return windowState(window);
  });
  if (process.env.NODE_ENV === 'development') {
    ipcMain.handle('preview:diagnostics', ({ sender }) => {
      const session = sessions.get(sender.id);

      return {
        active: Boolean(session && !session.stopped),
        quality: session?.quality || null,
        pid: session?.process?.pid || null,
      };
    });
  }

  ipcMain.handle('preview:install-apk', async (_, serial, filePath) => {
    try {
      return await installApk(findAdb(), serial, filePath);
    } catch (error) {
      return { error: error.message };
    }
  });
  ipcMain.handle('preview:devices', async () => {
    try {
      const binary = findAdb();
      const { stdout } = binary
        ? await execute(binary, ['devices', '-l'], { timeout: 5000 })
        : { stdout: '' };
      const adbDevices = stdout
        .split('\n')
        .filter((line) => /^\S+\s+(device|offline|unauthorized)\b/.test(line))
        .map((line) => {
          const [serial, status] = line.trim().split(/\s+/);

          return {
            serial,
            status,
            model: line.match(/model:(\S+)/)?.[1]?.replace(/_/g, ' ') || serial,
          };
        });

      const hdcDevices = await harmonyDevices().catch(() => []);

      return { devices: [...adbDevices, ...hdcDevices] };
    } catch (error) {
      return { devices: [], error: error.message };
    }
  });
  ipcMain.handle('preview:display-size', async (_, serial) => {
    try {
      const binary = findAdb();

      if (typeof serial !== 'string' || !serial || serial.length > 256)
        return null;
      if (
        (await harmonyDevices().catch(() => [])).some(
          (d) => d.serial === serial
        )
      )
        return { width: 720, height: 1600, transport: 'hdc' };
      if (!binary) return null;
      const session = { adb: binary, serial };
      const { stdout } = await adb(session, ['shell', 'wm', 'size']);
      const matches = [
        ...stdout.matchAll(/(?:Physical|Override) size:\s*(\d+)x(\d+)/g),
      ];
      const match = matches[matches.length - 1];

      if (!match) return null;
      const width = Number(match[1]);
      const height = Number(match[2]);

      if (width <= 0 || height <= 0 || width > 16384 || height > 16384)
        return null;
      const rotation = await adb(session, ['shell', 'dumpsys', 'input']).catch(
        () => ({ stdout: '' })
      );
      const orientation = Number(
        rotation.stdout.match(/SurfaceOrientation:\s*(\d)/)?.[1] ||
          rotation.stdout.match(/orientation=(\d)/)?.[1] ||
          0
      );

      return orientation % 2
        ? { width: height, height: width }
        : { width, height };
    } catch (_) {
      return null;
    }
  });
  ipcMain.handle('preview:start', async (event, serial, quality = 'eco') => {
    if (typeof serial !== 'string' || serial.length > 256)
      return { error: '设备标识无效' };

    if (
      (await harmonyDevices().catch(() => [])).some((d) => d.serial === serial)
    )
      return startHarmony(
        event.sender,
        serial,
        quality === 'high' ? 'high' : 'eco'
      );

    return start(event.sender, serial, quality === 'high' ? 'high' : 'eco');
  });
  ipcMain.handle('preview:stop', (event) =>
    stop(sessions.get(event.sender.id))
  );
  ipcMain.on('preview:ack', (event) => {
    const session = sessions.get(event.sender.id);

    if (session) session.pending = Math.max(0, session.pending - 1);
  });
  app.on('before-quit', () => {
    sessions.forEach((session) => {
      session.cleanup();
    });
  });
}
