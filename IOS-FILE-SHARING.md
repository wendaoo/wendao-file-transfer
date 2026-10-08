# iOS USB 文件共享

当前本地预览支持 macOS 13+，通过 USB 管理 iPhone/iPad 上开放文件共享的 App 文档。

## 使用

1. 连接设备并解锁，首次连接时在设备上选择“信任此电脑”。
2. 点击左侧“App 共享文档”展开文件面板。
3. 双击一个共享 App，进入文档目录。
4. 将 Finder 中的文件或文件夹拖入面板；将面板中的文档拖到 Finder 或桌面。

支持批量传输、递归文件夹、空文件/空文件夹、中文文件名、新建文件夹、重命名和删除。
传输按复制处理，源文件保留。已有同名目标会被拒绝，需要先重命名。
照片与视频通过 macOS ImageCaptureCore 单独读取，支持列表/网格缩略图和拖出到 Mac；只显示系统导入接口公开的媒体，不保证包含仅存于 iCloud 的原件。照片入口不支持上传、删除或重命名。其他 App 的私有文件及整个“文件”App 聚合视图不属于访问范围。
不需要安装配套 iOS App，也不会提供中转站。Android 投屏和 APK 安装在 iOS 连接时禁用。

## 实现

- `ffi/ios-files/main.m`：独立进程，通过 libimobiledevice 的 USB、lockdown、installation_proxy、House Arrest `VendDocuments` 和 AFC 通信。只查找 USB 设备，不访问 Wi-Fi 设备。
- `app/services/ios-files`：受限操作集、窗口绑定的设备会话、串行请求队列、进度回调、进程异常和超时处理。
- `FileExplorerIosDataSource`：接入现有文件操作和传输接口。iOS → ADB → MTP 顺序选择后端；已开始的传输失败后不会切换协议重试。
- 文件面板根目录包含“照片与视频”和开放文件共享的 App 列表；`/<bundle-id>/…` 映射至对应 App 的 Documents。App 根节点不能被删除、重命名或整体拖出。
- Finder 拖出复用现有 `NSFilePromiseProvider`。传输使用临时名称，完成后重命名；拒绝路径穿越、符号链接和特殊文件。
- 突然断电、拔线或进程被强制结束时，未完成的 `.openmtp-*` 临时项可能保留；重新连接后可显示隐藏文件并清理。批量复制已经完成的项目会保留。

## 构建与验证

首次准备依赖（写入项目目录，不安装 Homebrew 或修改系统）：

```sh
python3 scripts/local/fetch-ios-libs.py
bash scripts/local/run.sh build
```

依赖取自 Homebrew 官方 OCI 包仓库，固定版本并验证 SHA-256，包含 Intel 和 Apple Silicon 两套库。
`build/ios/*/licenses` 保留许可证和包来源记录。动态库采用相对路径加载，构建脚本可重新链接替换后的库。
当前兼容构建使用 libimobiledevice 1.3.0_3 及对应依赖；发布前应按目标系统重新评估依赖升级及多版本设备兼容性。

```sh
NODE_ENV=development node scripts/local/verify-ios-routing.cjs
NODE_ENV=development node scripts/local/verify-ios-queue.cjs
python3 scripts/local/verify-ios-device.py --app <允许共享文件的-App-bundle-id>
```

设备测试只写入 UUID 命名的独立测试目录，在 `finally` 中清理；包括 4 MiB SHA-256 往返、中文/引号/空格、空文件夹、重名保护、重命名和路径边界。
`OPENMTP_IOS_TEST_APP=<bundle-id> node scripts/local/verify-ios-drag.cjs` 在启用 9226 调试端口的开发预览中验证实际拖入处理与原生文件承诺回调（不模拟 Finder 的鼠标手势）。
真机运行已验证 macOS 13.7.4 + iPhone iOS 27.0；Apple Silicon 库和 helper 已构建，尚未在 Apple Silicon 主机实测。

## 照片接口

`ffi/ios-photos/main.m` 使用系统 ImageCaptureCore，按规范化的设备标识匹配当前 iPhone（部分设备的照片接口会省略 UDID 第二段的前导零）。会话绑定窗口，断线或重新连接后旧照片标识失效。缩略图按可见区域加载并限制缓存数量，无需安装配套 App。

照片导出由现有 NSFilePromiseProvider 驱动，先写入目标卷的临时目录，再独占提交到目标文件。ICDeleteAfterSuccessfulDownload 始终为否；文件冲突被拒绝，批量导出中已完成的项目保留。照片仅支持导入方向，不能写回系统相册。Live Photo 的静态照片和视频可能分别列出。

运行 `NODE_ENV=development node scripts/local/verify-ios-photos.cjs` 可读取照片列表和缩略图，导出一张小图片到 Mac 临时目录，验证过期标识、只读限制、重名保护及清理，不修改手机照片。

## iOS 界面范围

iOS 仅保留设备文件功能：App 文档双向传输，以及照片/视频浏览与导出。预览和全屏按钮保持原有位置并置灰禁用，不启动屏幕采集，也不请求相机权限。Android 实时预览保持不变。
