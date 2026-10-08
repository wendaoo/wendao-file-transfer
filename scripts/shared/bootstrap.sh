#!/usr/bin/env bash
# Install a project-local, architecture-matched build toolchain.
set -euo pipefail
cd "$(dirname "$0")/../.."
[[ "$(uname -s)" == Darwin ]] || { echo 'This shared build requires macOS 13 or later.' >&2; exit 1; }
xcode-select -p >/dev/null 2>&1 || { echo 'Install Command Line Tools first: xcode-select --install' >&2; exit 1; }
major="$(sw_vers -productVersion | cut -d. -f1)"
[[ "$major" -ge 13 ]] || { echo 'macOS 13 or later is required for iOS helpers.' >&2; exit 1; }
command -v python3 >/dev/null || { echo 'Python 3 is required.' >&2; exit 1; }
# Detect physical Apple Silicon even when the shell is translated by Rosetta.
if [[ "$(uname -m)" == arm64 || "$(sysctl -n hw.optional.arm64 2>/dev/null || true)" == 1 ]]; then
  node_arch=arm64
  checksum=6a5c4108475871362d742b988566f3fe307f6a67ce14634eb3fbceb4f9eea88c
else
  node_arch=x64
  checksum=d7a46eaf2b57ffddeda16ece0d887feb2e31a91ad33f8774da553da0249dc4a6
fi
mkdir -p .build-tools .cache
node_dir="$PWD/.build-tools/node-v16.20.2-darwin-$node_arch"
if [[ ! -x "$node_dir/bin/node" ]]; then
  archive="$PWD/.cache/node-v16.20.2-darwin-$node_arch.tar.gz"
  curl -fL --retry 3 --connect-timeout 30 "https://nodejs.org/dist/v16.20.2/node-v16.20.2-darwin-$node_arch.tar.gz" -o "$archive"
  printf '%s  %s\n' "$checksum" "$archive" | shasum -a 256 -c -
  tar -xzf "$archive" -C .build-tools
fi
export PATH="$PWD/.build-tools/packages/node_modules/.bin:$node_dir/bin:$PATH"
[[ "$(node --version)" == v16.20.2 ]] || { echo 'Unexpected Node version' >&2; exit 1; }
if [[ ! -f .build-tools/packages/node_modules/npm/bin/npm-cli.js || ! -f .build-tools/packages/node_modules/yarn/bin/yarn.js ]]; then
  "$node_dir/bin/node" "$node_dir/lib/node_modules/npm/bin/npm-cli.js" install --prefix "$PWD/.build-tools/packages" --no-audit --no-fund --save-exact npm@8.16.0 yarn@1.22.22
fi
node .build-tools/packages/node_modules/npm/bin/npm-cli.js --version
node .build-tools/packages/node_modules/yarn/bin/yarn.js --version
bash scripts/shared/build.sh install
bash scripts/shared/build.sh check
