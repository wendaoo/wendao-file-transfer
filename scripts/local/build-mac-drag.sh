#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
mkdir -p build/mac/bin/universal
xcrun clang -dynamiclib -fobjc-arc -framework AppKit -arch x86_64 -arch arm64 -mmacosx-version-min=10.13 ffi/mac-drag/DeviceDrag.m -o build/mac/bin/universal/device-drag.dylib
