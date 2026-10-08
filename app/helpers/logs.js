import { PATHS } from '../constants/paths';
import { undefinedOrNull } from '../utils/funcs';

/**
 * Description - Strip user home directory path from the error before it is sent to sentry
 * @param s
 * @return {string|string}
 */
export const redactHomeDirectory = (s) => {
  if (undefinedOrNull(s)) {
    return '';
  }

  const text = s.toString();
  const withoutHome = PATHS.homeDir
    ? text.split(PATHS.homeDir).join('[home]')
    : text;

  return withoutHome
    .replace(/(?:\/Users\/|\/home\/)[^\s/]+/g, '[home]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]');
};
