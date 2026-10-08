# HDC 本地工具目录

请把官网下载的 **macOS HDC 可执行文件与配套动态库**放在此目录。支持以下文件名：

- Intel Mac：`hdc_x86_64`、`libusb_shared_x86_64.dylib`
- Apple Silicon Mac：`hdc_arm64`、`libusb_shared_arm64.dylib`

本地运行时由 `hdc` 与 `libusb_shared.dylib` 链接指向当前 Mac 对应的文件。应用会优先使用这里的 `hdc`；未放入前继续使用 Mac 上已安装的 HDC。安装包构建时会按架构将对应二进制打入应用。

下载的说明文档也可放在此目录，保留原文件名。若下载的是压缩包，请先解压，并确保可执行文件有执行权限。

## 官方来源与公开再分发状态（2026-10-08）

用户提供的官方来源：[华为 HDC 文档中心](https://developer.huawei.com/consumer/cn/doc/doccenter-capabilities/hdc)。该链接记录工具来源，不等同于当前二进制的再分发授权。

用户补充的官方包名：`commandline-tools-mac-x64-6.1.1.300`，下载地址：[HarmonyOS Command Line Tools](https://developer.huawei.com/consumer/cn/download/command-line-tools-for-hmos)。用户另确认 Apple Silicon/arm64 包为 `commandline-tools-mac-arm64-6.1.1.300`，同样来自上述官网。两个架构的下载包名称与来源均已按用户提供的信息记录，尚未用原始压缩包与当前文件逐一比对。

两个架构的当前 HDC 文件均包含 `Ver: 3.0.0b` 字符串；这只是本地文件的字符串证据，与工具包版本 `6.1.1.300` 属于不同层级的版本信息，不构成版本冲突或文件匹配证明。仍需保存原始压缩包及随包 LICENSE/NOTICE/使用协议，并核对允许在公开 Git 仓库和安装包中再分发的条款。配套 libusb 动态库需单独核对许可与对应源码。

OpenHarmony 的 developtools_hdc 源码仓库使用 Apache-2.0，但不能据此直接把华为 SDK 中现有二进制标为 Apache-2.0。若无法确认授权，可改为用户从官方安装工具后调用，或采用具有明确许可且验证兼容性的源码自编译版本；当前项目尚未实施这项替换。
