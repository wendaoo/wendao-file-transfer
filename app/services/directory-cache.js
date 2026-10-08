// Short-lived navigation snapshots. Explicit refreshes and writes invalidate them.
const entries = new Map();

export const clearDirectoryCache = () => entries.clear();
export function cachedDirectory(key) {
  const entry = entries.get(key);

  return entry && Date.now() - entry.time < 5000 ? entry.data : null;
}

export function rememberDirectory(key, data) {
  entries.delete(key);
  entries.set(key, { time: Date.now(), data });
  if (entries.size > 12) entries.delete(entries.keys().next().value);
}
