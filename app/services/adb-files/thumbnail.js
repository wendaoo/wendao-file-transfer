import { nativeImage } from 'electron';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { quote, remotePath } from './protocol';

const execute = promisify(execFile);
const cache = new Map();
const pending = new Map();
const waiting = [];
let running = 0;
const MAX_BYTES = 20 * 1024 * 1024;

async function readThumbnail(session, filePath) {
  const file = remotePath(filePath, false);
  const { stdout } = await execute(
    session.adb,
    [
      '-s',
      session.serial,
      'exec-out',
      `test -f ${quote(file)} && head -c ${MAX_BYTES + 1} ${quote(file)}`,
    ],
    { encoding: 'buffer', timeout: 15000, maxBuffer: MAX_BYTES + 1024 }
  );

  if (!stdout.length || stdout.length > MAX_BYTES) return null;
  const image = nativeImage.createFromBuffer(stdout);

  if (image.isEmpty()) return null;
  const { width, height } = image.getSize();
  const scale = Math.min(1, 160 / Math.max(width, height));

  return image
    .resize({
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
    })
    .toDataURL();
}

export default async function thumbnail(session, request, isCurrent) {
  if (
    request.serial !== session.serial ||
    !/\.(png|jpe?g|gif|webp|bmp)$/i.test(request.filePath) ||
    request.size > MAX_BYTES
  )
    return null;
  remotePath(request.filePath, false);
  const key = JSON.stringify([
    session.serial,
    request.filePath,
    request.size,
    request.dateAdded,
  ]);

  if (cache.has(key)) return cache.get(key);
  if (pending.has(key)) return pending.get(key);
  if (waiting.length >= 128) return null;
  const task = (async () => {
    if (running >= 2) await new Promise((resolve) => waiting.push(resolve));
    else running += 1;
    try {
      if (!isCurrent()) return null;
      const result = await readThumbnail(session, request.filePath);

      if (!isCurrent()) return null;
      cache.set(key, result);
      if (cache.size > 128) cache.delete(cache.keys().next().value);

      return result;
    } catch (_) {
      return null;
    } finally {
      const next = waiting.shift();

      if (next) next();
      else running -= 1;
    }
  })();

  pending.set(key, task);
  try {
    return await task;
  } finally {
    pending.delete(key);
  }
}
