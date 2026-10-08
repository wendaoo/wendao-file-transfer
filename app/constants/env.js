/**
 * Constants
 * Note: Don't import log helper file from utils here
 */

const isLocalBuild = process.env.OPENMTP_LOCAL_BUILD === 'true';

const isDev = process.env.NODE_ENV !== 'production';
const isProd = process.env.NODE_ENV === 'production';
const isDebug = process.env.DEBUG_PROD === 'true';

const config = {
  dev: {
    reportToSenty: false,
    disableReactWarnings: true,
    allowDevelopmentEnvironment: true,
  },
  prod: {
    reportToSenty: false,
    disableReactWarnings: false,
    allowDevelopmentEnvironment: false,
  },
  debug: {
    reportToSenty: false,
    disableReactWarnings: false,
    allowDevelopmentEnvironment: true,
  },
};

let _env = 'dev';

if (isProd) {
  _env = 'prod';
} else if (isDebug) {
  _env = 'debug';
}

module.exports.IS_LOCAL_BUILD = isLocalBuild;

module.exports.ENV_FLAVOR = isLocalBuild
  ? {
      ...config[_env],
      reportToSenty: false,
    }
  : config[_env];

module.exports.IS_DEV = isDev;

module.exports.IS_PROD = isProd;

module.exports.DEBUG_PROD = isDebug;

module.exports.IS_RENDERER = process && process.type === 'renderer';
