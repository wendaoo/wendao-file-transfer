import path from 'path';

// ADB shell joins arguments remotely. Quote every path, including embedded quotes.
export const quote = (value) => `'${value.replace(/'/g, "'\\''")}'`;

export function remotePath(value, allowRoot = true) {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.includes('\0') ||
    value.split('/').includes('..')
  )
    throw new Error('设备路径无效');
  const normalized = path.posix.normalize(value);

  if (!allowRoot && normalized === '/') throw new Error('不能修改设备根目录');

  return `/sdcard${normalized === '/' ? '' : normalized}`;
}

export function parseDirectory(output, ignoreHidden) {
  const nodes = [];
  const separator = output.indexOf('\0\0');

  if (separator < 0) throw new Error('ADB 目录数据不完整');
  const paths = output.slice(0, separator).split('\0').filter(Boolean);
  const stats = output
    .slice(separator + 2)
    .trim()
    .split('\n')
    .filter(Boolean);

  if (paths.length !== stats.length) throw new Error('ADB 目录数据不完整');
  paths.forEach((fullPath, index) => {
    const metadata = stats[index].match(/^([0-9a-f]+) (\d+) (\d+)$/i);

    if (!metadata || !fullPath.startsWith('/sdcard/'))
      throw new Error('ADB 目录数据无效');
    const name = path.posix.basename(fullPath);
    const type = Math.floor(parseInt(metadata[1], 16) / 4096) * 4096;

    // Do not follow symbolic links outside shared storage.
    if (
      (!ignoreHidden || !name.startsWith('.')) &&
      [0x4000, 0x8000].includes(type)
    )
      nodes.push({
        name,
        path: fullPath.slice(7),
        size: Number(metadata[2]),
        isFolder: type === 0x4000,
        dateAdded: new Date(Number(metadata[3]) * 1000).toISOString(),
      });
  });

  return nodes;
}
