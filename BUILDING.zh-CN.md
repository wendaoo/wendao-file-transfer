# wendao · 文件互传：共享构建说明

安卓设备画面实时预览，文件拖拽轻松传输

仓库根目录：`wendao-file-transfer/`；应用标识：`local.wendao.filetransfer`。

## 下载源码后自行打包（macOS）

本目录就是仓库根目录。可使用 Git 克隆，或下载并完整解压仓库 ZIP；无需获取作者工作区的其他目录。当前共享版支持在 macOS 13 或更高版本的 Intel / Apple Silicon Mac 上构建。

## 三步生成安装包

1. 安装 Apple 命令行开发工具（若已安装可跳过）：

   ```sh
   xcode-select --install
   ```

   等待系统安装完成。需要可运行的 Python 3（Apple Command Line Tools 通常提供），Git、curl 和网络连接。

2. 在终端进入完整解压后的仓库根目录，安装项目专用工具链和依赖：

   ```sh
   bash scripts/shared/bootstrap.sh
   ```

   脚本自动选择本机 Intel / Apple Silicon 架构，下载 Node 16.20.2 并核对固定 SHA-256，安装 npm 8.16.0、Yarn 1.22.22，按 yarn.lock 安装依赖。工具存放在本项目 `.build-tools/`，缓存位于 `.cache/`，不会替换系统 Node 或要求外层 `.local-tools/`。

3. 生成本机架构的 DMG：

   ```sh
   bash scripts/shared/build.sh package
   ```

   输出为 `dist/wendao-file-transfer-3.3.0-mac-x64.dmg` 或 `dist/wendao-file-transfer-3.3.0-mac-arm64.dmg`；应用为 `dist/mac/wendao · 文件互传.app` 或 `dist/mac-arm64/wendao · 文件互传.app`。打开 DMG，把应用拖到 Applications 后启动。

## 签名与使用范围

自行构建使用 wendao · 文件互传 名称及独立 appId，不需要 Apple 开发者账号；自动更新、上游发布和错误上报在本地构建模式关闭。该包不带 Apple 开发者签名和公证，macOS 可能阻止第一次启动；系统允许时可通过“系统设置 → 隐私与安全性 → 仍要打开”批准自己构建的应用。正式公开发行需配置自己的签名、公证和更新源。

默认 Kalam MTP 内核有本机架构版本。传统 MTP 模式使用历史 Intel mtp-cli，在 Apple Silicon 上可能需要 Rosetta；不影响默认 Kalam 模式。

Android MTP 传输需要设备开放 USB 文件传输；ADB 预览/文件功能需开启 USB 调试并授权电脑。HarmonyOS HDC 功能需设备支持并授权 USB 调试。iOS 文件共享需解锁设备并信任电脑；只能访问开放文件共享的 App 文档，以及系统照片接口公开的媒体。iOS 不提供投屏。没有设备连接也应能打开应用。

## 哪些文件必须上传

保留源码、配置、文档、package.json、yarn.lock、`app/vendors/`、`build/` 中受版本管理的原生输入及许可、`tools/`。本项目已经提供两种架构的原生输入和 SHA-256 清单；默认打包会重新编译 macOS 拖放与 iOS helper，MTP 内核及第三方工具使用仓库内固定的二进制。

不要整体忽略 build/。无需上传 node_modules、dist、dll、.build-tools、.cache、生成的 helper 和应用编译输出；现有 .gitignore 已排除。安装包与工作区清理归档不属于本仓库。

## 其他命令

```sh
bash scripts/shared/build.sh check   # 校验原生输入
bash scripts/shared/build.sh test    # 设备路由、视频解析与传输队列检查
bash scripts/shared/build.sh build   # 只构建，不生成 DMG
bash scripts/shared/build.sh smoke   # 在临时独立配置下启动并检查打包后的界面
bash scripts/shared/build.sh start   # 运行已经构建的应用
bash scripts/shared/build.sh dev     # 开发预览
```

更新原生输入后，需要有意更新 `scripts/shared/native-resources.json` 校验清单。若要重新下载 iOS 依赖，可运行 `python3 scripts/local/fetch-ios-libs.py`；这不是完整仓库首次构建所必需。它固定下载版本并校验内容，可能因上游服务不可用而失败。重新构建 MTP 内核还需要 Go 及其原生编译环境，见 ffi/kalam/native/README.md；普通应用打包不需要 Go。

## 常见失败

- 企业网络证书：如果提示 unable to verify the first certificate，请向管理员获取受信任的 CA PEM 文件，以 `NODE_EXTRA_CA_CERTS=/绝对路径/证书.pem bash scripts/shared/bootstrap.sh` 运行。不要关闭 TLS 验证。
- 无法下载：确认能访问 nodejs.org、npm/Yarn 包源、GitHub 和 Electron 下载源。安装依赖必须联网；完整 node_modules 不随仓库分发。
- 原生资源缺失/校验失败：重新下载完整仓库，不要省略 build/ 或 tools/；不要从已修改的资源目录继续构建。
- npm 版本不兼容：使用 shared 脚本，它自动固定兼容版本。
- 编译工具找不到：完成 Command Line Tools 安装后再运行；可用 `xcode-select -p` 确认。
- 切换架构：使用本机原生工具链；切换已有依赖安装架构时先移走 node_modules 和 .build-tools 后重新 bootstrap。

## 验证边界

工作流为 Intel 与 ARM Mac 分别构建 DMG。构建成功不等于所有设备功能都经过真机验证；不同系统与设备仍需测试。Node 16 / Electron 18 是当前兼容基线，升级必须同时验证原生依赖和 Electron，不能直接替换版本。

界面 smoke 检查需要有桌面会话；默认随机选择本地调试端口，可通过 OPENMTP_SMOKE_PORT 指定。会关闭检查时自己启动的应用，截图和记录在 .cache/。

本机已验证的结果与范围见 [BUILD-VERIFICATION.md](BUILD-VERIFICATION.md)。

## 上传共享仓库

仓库根目录就是当前目录，不要把外层安装包或清理归档上传。第一次提交前检查 `git status`，应不含 node_modules、dist、.cache、.build-tools。已有本地 Git 初始化和暂存；可检查后提交并设置自己的远程仓库：

```sh
git commit -m "Prepare standalone macOS shared build"
# 把下面引号内的地址替换为你自己的空仓库地址。
git remote add origin 'https://github.com/你的账号/你的仓库.git'
git push -u origin main
```

若 Git 尚未配置提交身份，请设置自己的 user.name 与 user.email。GitHub 下载 ZIP 和 Git clone 都应获取完整源码；不要只下载 app/。CI runner 选择依据：[GitHub 官方说明](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)。

公开前先阅读 [第三方来源与许可说明](THIRD_PARTY.md) 和 [目录导航与文件夹用途说明](文件用途说明.html)。HDC 的 Intel/ARM 下载包均已由用户确认来自华为官网，版本为 6.1.1.300；当前仍缺少再分发协议的核实，以及其他 GPL/LGPL 预编译组件的完整对应源码材料。来源清楚与构建通过不能代替分发授权。

`git push` 会公开当前提交中包含的全部第三方二进制；私有共享也必须遵守许可证。若无法确认 HDC 等工具的再分发许可，需改为外部安装/用户自行获取并同步修改资源校验和打包流程，不能只删除文件，否则当前构建入口会失败。上面的提交命令是准备步骤示例，并非本项目已完成公开许可审核的声明。

`第三方依赖许可清单.csv` 是已安装包元数据快照，含开发依赖，需结合 yarn.lock 与实际安装包再核实。网站域名、上游联系方式、真实设备截图和新增代码归属等待办需在公开发布前处理。本工作区的完整检查报告位于仓库上一层，不随源码共享。
