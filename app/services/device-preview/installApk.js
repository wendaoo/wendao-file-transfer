import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { promisify } from 'util';

const execute = promisify(execFile);
const installing = new Set();

export default async function installApk(binary, serial, filePath) {
  if (
    typeof serial !== 'string' ||
    !serial ||
    serial.length > 256 ||
    /[\s\0]/.test(serial)
  )
    throw new Error('请先连接目标 Android 设备');
  if (!binary) throw new Error('未找到 ADB，请先安装 Android 平台工具');
  if (
    typeof filePath !== 'string' ||
    !path.isAbsolute(filePath) ||
    filePath.includes('\0') ||
    path.extname(filePath).toLowerCase() !== '.apk'
  )
    throw new Error('请拖入本机的 APK 文件');
  if (installing.has(serial)) throw new Error('该设备正在安装 APK，请稍候');
  installing.add(serial);
  try {
    const stat = await fs.stat(filePath);

    if (!stat.isFile() || !stat.size)
      throw new Error('APK 文件为空或不是普通文件');
    const { stdout: devices } = await execute(binary, ['devices'], {
      timeout: 10000,
    });
    const target = devices
      .split(/\r?\n/)
      .map((line) => line.trim().split(/\s+/))
      .find(([id]) => id === serial);

    if (target?.[1] === 'unauthorized')
      throw new Error('请在手机上允许 USB 调试后重试');
    if (target?.[1] !== 'device')
      throw new Error('目标设备未连接或已离线，请重新连接后重试');
    const { stdout, stderr } = await execute(
      binary,
      ['-s', serial, 'install', '-r', filePath],
      {
        timeout: 5 * 60 * 1000,
        maxBuffer: 1024 * 1024,
      }
    );
    const output = `${stdout}\n${stderr}`.trim();

    if (!/^Success\s*$/m.test(output) || /Failure\s*\[/.test(output))
      throw new Error(output || '设备未返回安装成功，请检查手机');

    return { name: path.basename(filePath) };
  } catch (error) {
    if (error.killed)
      throw new Error('安装超时，请检查手机上的安装确认及安装结果后重试');
    throw new Error((error.stderr || error.stdout || error.message).trim());
  } finally {
    installing.delete(serial);
  }
}
