# Third-party native resources

The upstream project LICENSE and attribution are retained. Repository hashes identify the supplied bytes; they are not proof of third-party authorship or authenticity.

| Resource | Source / license material |
| --- | --- |
| Kalam and legacy MTP libraries | Inherited OpenMTP native resources in build/mac/bin; Kalam source in ffi/kalam/native, dependencies pinned by go.mod/go.sum. Historical binaries are kept for compatibility. |
| iOS libraries | Fixed Homebrew bottles, package version, digest and source annotations in build/ios/*/licenses/*/provenance.json; license texts alongside them. Downloader: scripts/local/fetch-ios-libs.py. |
| ADB | Android platform-tools executable; tools/adb/NOTICE.txt retains bundled notices. |
| scrcpy server 3.3.4 | build/mirror/LICENSE.scrcpy and SHA256SUMS.txt. Upstream: https://github.com/Genymobile/scrcpy |
| HDC / libusb | Existing locally supplied macOS SDK tools in tools/hdc. Official source supplied by the user: https://developer.huawei.com/consumer/cn/doc/doccenter-capabilities/hdc . Both HDC binaries contain a 3.0.0b version string; The user identifies the x64 source package as commandline-tools-mac-x64-6.1.1.300 from https://developer.huawei.com/consumer/cn/download/command-line-tools-for-hmos . The user also identifies the arm64 source package as commandline-tools-mac-arm64-6.1.1.300 from the same official download page. Exact byte-to-archive correspondence and redistribution terms remain unverified. Do not treat the OpenMTP MIT license as covering these binaries. See tools/hdc/README.md. |
| pretty-file-icons | app/vendors/pretty-file-icons contains its own LICENSE and package metadata. |

For public distribution, verify applicable third-party redistribution terms, especially HDC whose redistribution terms remain unverified. Preserve all notices and source records. A private collaborative repository does not replace third-party license obligations.

## Public release review (2026-10-08)

The current cleanup and release review is recorded in update-history/2026-10-08-update-history.md. The redistribution requirements below still apply to public sharing. Source-only naming does not exempt checked-in binaries from redistribution obligations. Native LGPL libraries need complete corresponding sources and applicable build/patch information; version/hash records and license texts alone do not close that requirement. Some iOS bottle packages contain differently licensed utilities; verify per component rather than assuming the whole package is LGPL. Legacy MTP binary provenance, libusb notices/sources, ADB SDK/open-source terms, and JavaScript runtime license notices remain release work.

The user-supplied HDC URL records official origin, not an authorization opinion. This review does not certify legal compliance or trademark clearance.

## Installed JavaScript dependency snapshot

[第三方依赖许可清单.csv](第三方依赖许可清单.csv) records local package metadata including development dependencies. It is not a complete runtime SBOM or a license compatibility decision; reconcile it with yarn.lock and the final packaged dependencies, preserve required notices, and investigate unknown/custom license declarations. The folder overview is [文件用途说明.html](文件用途说明.html).

## Current distribution boundary (2026-10-08)

HDC and its paired libusb remain bundled by architecture in installers at the user's request. Their redistribution review remains incomplete; retaining the feature does not establish redistribution permission. Existing installers predate this change and must not be shared as reviewed outputs. Public packaging is blocked and CI no longer uploads installers while Electron support and native redistribution review remain incomplete. Local preview packaging is for development and is not a compliance certification.

Git publication includes the checked-in native resources, including HDC and its paired libusb, retained at the user's request. Their original bytes and architecture-specific installer bundling are preserved. Its redistribution terms remain subject to review even without publishing an installer. License notices and public upstream attribution are retained. Local Git configuration is not pushed, but commit metadata and previous file versions are pushed with history. See update-history/2026-10-08-update-history.md.
