#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
[[ "$(uname -s)" == Darwin ]] || { echo 'macOS is required.' >&2; exit 1; }
if [[ "$(uname -m)" == arm64 || "$(sysctl -n hw.optional.arm64 2>/dev/null || true)" == 1 ]]; then node_arch=arm64; else node_arch=x64; fi
node_dir="$PWD/.build-tools/node-v16.20.2-darwin-$node_arch"
if [[ ! -x "$node_dir/bin/node" || ! -f .build-tools/packages/node_modules/yarn/bin/yarn.js ]]; then
  echo 'First run: bash scripts/shared/bootstrap.sh' >&2
  exit 1
fi
export PATH="$PWD/.build-tools/packages/node_modules/.bin:$node_dir/bin:$PATH"
export npm_config_cache="$PWD/.cache/npm"
export YARN_CACHE_FOLDER="$PWD/.cache/yarn"
export ELECTRON_CACHE="$PWD/.cache/electron"
export ELECTRON_BUILDER_CACHE="$PWD/.cache/electron-builder"
export OPENMTP_LOCAL_BUILD=true
export OPENMTP_SKIP_EXTENSIONS=true
export CSC_IDENTITY_AUTO_DISCOVERY=false
export ELECTRON_NOTARIZE=NO
[[ "$(node --version)" == v16.20.2 ]] || exit 1
[[ "$(node -p 'process.arch')" == "$node_arch" ]] || exit 1
action="${1:-package}"
case "$action" in
  install) yarn install --frozen-lockfile --non-interactive ;;
  check) node scripts/shared/check-resources.cjs ;;
  test)
    export NODE_ENV=development
    node scripts/local/verify-ios-routing.cjs
    node scripts/local/verify-adb-routing.cjs
    node scripts/local/verify-native-queue.cjs
    node scripts/local/verify-video-packets.cjs
    ;;
  build) yarn build-local ;;
  package) yarn package-local && node scripts/shared/verify-package.cjs ;;
  smoke) node scripts/shared/smoke-package.cjs ;;
  start) yarn start-local ;;
  dev) node scripts/shared/check-resources.cjs && yarn dev-ui ;;
  *) echo 'Usage: bash scripts/shared/build.sh {install|check|test|build|package|smoke|start|dev}' >&2; exit 1 ;;
esac
