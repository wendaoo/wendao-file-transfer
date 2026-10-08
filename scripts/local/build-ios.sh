#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
for target in amd64 arm64; do
  mkdir -p "build/ios/$target/bin"
  arch="$target"
  [[ "$target" == amd64 ]] && arch=x86_64
  root="build/ios/$target"
  [[ -f "$root/lib/libimobiledevice-1.0.dylib" ]] || { echo 'Run python3 scripts/local/fetch-ios-libs.py first' >&2; exit 1; }
  xcrun clang -fobjc-arc -O2 -Wall -Wextra -arch "$arch" -mmacosx-version-min=13.0 \
    -framework Foundation -I"$root/include" -L"$root/lib" \
    -Wl,-rpath,@executable_path/../lib -limobiledevice-1.0 -lplist-2.0 \
    ffi/ios-files/main.m -o "$root/bin/ios-files"
  xcrun clang -fobjc-arc -O2 -arch "$arch" -mmacosx-version-min=13.0 \
    -framework Foundation -framework ImageCaptureCore \
    ffi/ios-photos/main.m -o "$root/bin/ios-photos"
  codesign --force --sign - "$root/bin/ios-photos"
  codesign --force --sign - "$root/bin/ios-files"
done
