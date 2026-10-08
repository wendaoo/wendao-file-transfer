# UI 开发预览

启动：

```bash
cd /你的项目位置/wendao-file-transfer
bash scripts/shared/build.sh dev
```

该命令自动使用本项目内工具链（首次先运行 `bash scripts/shared/bootstrap.sh`），运行 `yarn dev-ui`，启动 Webpack 开发服务器和 Electron 开发窗口。

- 保存 React JSX、界面样式或 SCSS 后自动增量编译并更新窗口，不需要打包 DMG。
- 已实测：修改 app.global.scss 后，运行中窗口的 CSS 标记自动变化，测试标记已移除。
- 热更新不保证所有组件状态保留；遇到状态未更新，可用 Cmd+R 刷新。
- 修改 Electron 主进程、Webpack 配置或原生模块后需要重启开发进程；原生模块改动可能需要重新编译。
- 开发环境默认使用 localhost:4642。应用依赖 Electron / Node 系统接口，直接在普通浏览器打开服务器地址不能获得完整可运行应用。
- 开发配置目录是 ~/Library/Application Support/local.wendao.filetransfer.dev，与预览安装包和原 OpenMTP 分开。
- 开发入口跳过自动下载 React/Redux 调试扩展，保留 Electron 内置开发者工具。
- 初次启动需要编译开发资源，后续保存使用增量更新。
- 在终端按 Ctrl+C 停止；如 Electron 窗口仍存在，使用 Cmd+Q 退出该开发窗口。
- 本模式仍使用真实文件接口；修改 UI 不需要手机，但实际文件操作会影响真实文件。

常用修改位置：

- app/containers/HomePage/index.jsx：主页面和双栏布局。
- app/containers/HomePage/components/：工具栏和文件列表。
- app/containers/HomePage/styles/：页面和组件样式。
- app/styles/scss/：全局样式。
- app/containers/Settings/：设置界面。

界面改好后，再运行 `scripts/local/run.sh package` 生成安装包。
