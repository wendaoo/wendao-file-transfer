#!/usr/bin/env zx

/* eslint-disable */

/**
 * Kalam.dylib built with older Go toolchains carries chained-fixups
 * metadata with an incorrect seg_count (4 instead of 5). macOS 27
 * (Golden Gate) and newer refuses to dlopen() such a mismatched dylib:
 *   "chained fixups, seg_count does not match number of segments"
 * Tahoe (26) doesn't hit this crash, but this script targets macOS >=26
 * anyway.
 * Go >=1.26 generates the correct seg_count natively -- no binary
 * patching involved here. This script checks the active `go` toolchain
 * version before building and refuses to run on an older Go that would
 * reproduce the bug.
 *
 * Original file: ./build.mjs -- keep this file in sync with it manually.
 * Run this file the same way, from the project root:
 *   zx ./ffi/kalam/native/scripts/build-arm-seg5.mjs
 */

import 'zx/globals';
import fs from 'fs-extra';
import { packageDirectory } from 'pkg-dir';
import replace from 'replace';
import chalk from 'chalk';
import macosVersion from 'macos-version';

await $`export LANG=en_US.UTF-8`;
await $`export LC_ALL=en_US.UTF-8`;

const DIR_MODE = 0o2775;
const PKG_ROOT_DIR = await packageDirectory();
const TEMP_ROOT_DIR = `${PKG_ROOT_DIR}/tmp`;
const LIBUSB_BOTTLE_TEMP_DIR = `${TEMP_ROOT_DIR}/libusb_cache`;
const KALAM_NATIVE_DIR = `${PKG_ROOT_DIR}/ffi/kalam/native`;
const BUILD_BASE_DIR = `${PKG_ROOT_DIR}/build`;

const orangeChalk = chalk.bold.hex('#FFA500');

// the minimum Go toolchain version that generates correct chained-fixups
// seg_count metadata (fixes the macOS 27+ dlopen crash) without needing
// any post-build patching
const MIN_GO_VERSION = { major: 1, minor: 26 };

async function checkGoVersion() {
  const raw = (await $`go version`).stdout.trim();
  const match = raw.match(/go(\d+)\.(\d+)(?:\.(\d+))?/);

  if (!match) {
    throw new Error(`could not parse the Go version from: "${raw}"`);
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);

  const isNewEnough =
    major > MIN_GO_VERSION.major ||
    (major === MIN_GO_VERSION.major && minor >= MIN_GO_VERSION.minor);

  if (!isNewEnough) {
    throw new Error(
      `Go ${MIN_GO_VERSION.major}.${MIN_GO_VERSION.minor}+ is required to build a correctly-formed arm64 kalam.dylib (found "${raw}"). Upgrade Go and try again.`
    );
  }

  console.info(
    orangeChalk(
      `using ${raw} (>= go${MIN_GO_VERSION.major}.${MIN_GO_VERSION.minor} required) -- ok\n`
    )
  );
}

await checkGoVersion();

// find the brew bottle hashes here: https://github.com/Homebrew/homebrew-core/blob/main/Formula/lib/libusb.rb
// arm64_tahoe only -- libusb 1.0.30
const libusbBrewBottles = {
  '184daaa6108f0a56eb72c58cc4124dbbb0b54a655632dffdf8334569d71e2a34': {
    sha256: `184daaa6108f0a56eb72c58cc4124dbbb0b54a655632dffdf8334569d71e2a34`,
    customFilePath: null, // null | {shouldProcessLibusbDylibConfig: boolean, shouldProcessPkgConfig: boolean, url: string }
    arch: `arm64`,
    os: `darwin`,
    osName: `mac`,
    osVersion: `tahoe`,
    libusbVersion: `1.0.30`,
  },
};

// Go >=1.26 itself does not run on macOS below 12 (Monterey) -- this is a
// build-host requirement, unlike the general ./build.mjs which only needs
// macOS >=10.14 since it supports older Go toolchains too.
if (macosVersion.is('<12')) {
  throw new Error(
    `This script requires Go >=${MIN_GO_VERSION.major}.${MIN_GO_VERSION.minor}, which does not run on macOS versions below 12 (Monterey). Build on a machine running macOS >=12.`
  );
}

async function getCmd(cmd) {
  const op = await $`${cmd}`;

  return op.stdout.trimEnd();
}

function getBottlePath({ prefix, bottle }) {
  return `${prefix}_${bottle.libusbVersion}_${bottle.osVersion}_${bottle.os}_${bottle.arch}`;
}

function getLibusbBottleCachePath({ bottle }) {
  const libusbFullFileName = `libusb-1.0.0.dylib`;
  const libusbCleanedFileName = `libusb-seg5.dylib`;
  const kalamFileName = `kalam-seg5.dylib`;
  const kalamDebugReportFileName = `kalam_debug_report-seg5`;

  const identifier = getBottlePath({ prefix: 'libusb', bottle });
  const tarball = `${LIBUSB_BOTTLE_TEMP_DIR}/${identifier}.tar.gz`;
  const extracted = `${LIBUSB_BOTTLE_TEMP_DIR}/${identifier}`;
  const pkgconfigBaseDir = `${extracted}/libusb/${bottle.libusbVersion}/lib/pkgconfig`;
  const pkgconfig = `${pkgconfigBaseDir}/libusb-1.0.pc`;
  const pkgConfigPrefix = `${extracted}`;
  const libusbDylib = `${extracted}/libusb/${bottle.libusbVersion}/lib/${libusbFullFileName}`;

  // same directory as the normal arm64 build -- only the filenames differ,
  // so this never collides with the existing kalam.dylib/libusb.dylib
  const buildDir = `${BUILD_BASE_DIR}/${bottle.osName}/bin/${bottle.arch}`;

  const libusbDylibInBuildDir = `${buildDir}/${libusbCleanedFileName}`;
  const kalamDylibInBuildDir = `${buildDir}/${kalamFileName}`;
  const kalamDebugReportInBuildDir = `${buildDir}/${kalamDebugReportFileName}`;
  const rpath = `@loader_path/${libusbCleanedFileName}`;

  return {
    bottle,
    identifier,
    tarball,
    extracted,
    pkgconfig,
    pkgconfigBaseDir,
    pkgConfigPrefix,
    buildDir,
    libusbDylib,
    libusbDylibInBuildDir,
    kalamDylibInBuildDir,
    kalamDebugReportInBuildDir,
    rpath,
  };
}

await cd(PKG_ROOT_DIR);
const currentDir = await getCmd(`pwd`);

if (currentDir !== PKG_ROOT_DIR) {
  throw `The current working directory should be ${PKG_ROOT_DIR}`;
}

console.info(`creating the temp directory in ${TEMP_ROOT_DIR}...\n`);
await fs.ensureDirSync(TEMP_ROOT_DIR, DIR_MODE);

console.info(
  `creating the libusb temp directory in ${LIBUSB_BOTTLE_TEMP_DIR}...\n`
);
await fs.ensureDirSync(LIBUSB_BOTTLE_TEMP_DIR, DIR_MODE);
$`chmod -R +w ${LIBUSB_BOTTLE_TEMP_DIR}`;

// downloading the 'libusb' Brew bottles
console.info(`downloading the 'libusb' Brew bottles...\n`);

async function runPrerequisites({ bottles }) {
  console.info(`running prerequisites on the brew bottles...`);

  for await (const [, bottle] of Object.entries(bottles)) {
    console.info(
      `attempting to download the libusb tar file for: ${bottle.os}-${bottle.osName}-${bottle.osVersion}-${bottle.arch}-${bottle.libusbVersion}`
    );

    const bottlePath = getLibusbBottleCachePath({ bottle });
    if (bottle.customFilePath) {
      console.info(`downloading the libusb tar file from custom url`);

      await $`curl -L -o ${bottlePath.tarball} ${bottle.customFilePath.url}`;
    } else {
      await $`curl -L -H "Authorization: Bearer QQ==" -o ${bottlePath.tarball} https://ghcr.io/v2/homebrew/core/libusb/blobs/sha256:${bottle.sha256}`;
    }
  }

  // unarchiving the 'libusb' Brew bottles
  console.info(`unarchiving the 'libusb' Brew bottles...\n`);

  for await (const [, bottle] of Object.entries(bottles)) {
    console.info(
      `attempting to unarchive the libusb tar file for: ${bottle.os}-${bottle.osName}-${bottle.osVersion}-${bottle.arch}-${bottle.libusbVersion}`
    );

    const bottlePath = getLibusbBottleCachePath({ bottle });
    console.info(
      `[${bottlePath.identifier}] creating the libusb temp directory in ${bottlePath.extracted}...\n`
    );
    await fs.ensureDirSync(bottlePath.extracted, DIR_MODE);
    await $`LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 tar -xvf ${bottlePath.tarball} -C ${bottlePath.extracted} --no-same-permissions`;
    await $`chmod -R +w ${bottlePath.extracted}`;
  }

  await $`sleep 1`;

  // processing the 'libusb' Brew bottles
  console.info(`processing the 'libusb' Brew bottles...\n`);

  for await (const [, bottle] of Object.entries(bottles)) {
    console.info(
      `attempting to process the libusb tar file for: ${bottle.os}-${bottle.osName}-${bottle.osVersion}-${bottle.arch}-${bottle.libusbVersion}`
    );

    const bottlePath = getLibusbBottleCachePath({ bottle });

    if (bottle.customFilePath?.shouldProcessPkgConfig !== false) {
      // replacing the string `@@HOMEBREW_CELLAR@@` in the pkg-config file
      console.info(
        `[${bottlePath.identifier}] replacing the string '@@HOMEBREW_CELLAR@@' in the pkg-config file...\n`
      );
      await replace({
        regex: '@@HOMEBREW_CELLAR@@',
        replacement: bottlePath.pkgConfigPrefix,
        paths: [bottlePath.pkgconfig],
        recursive: false,
        silent: false,
      });
    } else {
      console.info(
        `skipping the processing of the pkg config which was downloaded from the custom file path`
      );
    }

    if (bottle.customFilePath?.shouldProcessLibusbDylibConfig !== false) {
      // copying the libusb-1.0.0.dylib to the build directory (as libusb-seg5.dylib)
      console.info(
        `[${bottlePath.identifier}] attempting to copy the libusb-1.0.0.dylib to the build directory...\n`
      );

      await fs.ensureDirSync(bottlePath.buildDir, DIR_MODE);
      await fs.copyFileSync(
        bottlePath.libusbDylib,
        bottlePath.libusbDylibInBuildDir
      );

      // fixing the rpath in the libusb-1.0.0.dylib so kalam-seg5.dylib
      // ends up referring to '@loader_path/libusb-seg5.dylib'
      console.info(
        `[${bottlePath.identifier}] fixing the rpath in the libusb-1.0.0.dylib...\n`
      );

      // todo: FIXME
      //  strangely the `install_name_tool` command doesnt work on a macos monterey dylib file
      await $`install_name_tool -id ${bottlePath.rpath} ${bottlePath.libusbDylib}`;
    } else {
      console.info(
        `skipping the processing of the libusb dylib which was downloaded from the custom file path`
      );
    }
  }

  await $`sleep 1`;
}

await runPrerequisites({ bottles: libusbBrewBottles });

for await (const [, bottle] of Object.entries(libusbBrewBottles)) {
  const bottlePath = getLibusbBottleCachePath({ bottle });

  // building kalam
  console.info(`building kalam (seg5)...\n`);
  await $`(
  cd ${KALAM_NATIVE_DIR} && CGO_ENABLED=1 \
        PKG_CONFIG_PATH=${bottlePath.pkgconfigBaseDir} \
        CGO_CFLAGS='-Wno-deprecated-declarations' \
        GOARCH=${bottle.arch} GOOS=${bottle.os} \
        go build \
        -v -a -trimpath \
        -o ${bottlePath.kalamDylibInBuildDir} -buildmode=c-shared ./*.go
        )`;

  // building kalam_debug_report
  console.info(`building kalam_debug_report (seg5)...\n`);
  await $`(
  cd ${KALAM_NATIVE_DIR} && CGO_ENABLED=1 \
        PKG_CONFIG_PATH=${bottlePath.pkgconfigBaseDir} \
        CGO_CFLAGS='-Wno-deprecated-declarations' \
        GOARCH=${bottle.arch} GOOS=${bottle.os} \
        go build \
        -v -a -trimpath \
        -o ${bottlePath.kalamDebugReportInBuildDir} kalam_debug_report/*.go
        )`;
}

console.warn(
  orangeChalk(
    `\nNOTE: standalone, focused variant of ./build.mjs (same directory).\n\n- Scope: arm64 only, built with Go ${MIN_GO_VERSION.major}.${MIN_GO_VERSION.minor}+\n- Output files use the '-seg5' suffix\n- They live in the same build/mac/bin/arm64/ directory, alongside (not replacing) the existing kalam.dylib / libusb.dylib / kalam_debug_report\n- If you change one of these two files, check whether the other needs the same change\n`
  )
);
