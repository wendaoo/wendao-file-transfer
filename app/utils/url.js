import { shell } from 'electron';

export const openExternalUrl = (url, events = null) => {
  if (events) {
    events.preventDefault();
  }

  try {
    const parsed = new URL(url);

    if (
      !['https:', 'http:'].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password
    ) {
      return Promise.resolve(false);
    }

    return shell.openExternal(parsed.href).then(() => true);
  } catch (error) {
    return Promise.resolve(false);
  }
};
