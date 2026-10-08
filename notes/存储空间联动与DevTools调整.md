# 存储空间联动与 DevTools 调整

更新日期：2026-09-23

## 功能与界面

- 存储空间卡片控制设备文件目录的展开、收起。默认收起；再次展开时保留当前目录和设备连接。
- 收起目录时，主界面宽度为 360px；首次展开为 1280px，后续恢复上次展开的宽度，并按屏幕可用空间调整。
- 隐藏目录期间屏蔽文件操作快捷键。卡片支持鼠标点击及 Enter / 空格操作。
- 卡片右上角使用 `assets/前进 forward.svg`，始终向右。图标从 24px 缩小至 16px，补偿 SVG 右侧留白，使可见箭头尖端与存储进度条右边缘对齐。
- 修复窗口切换时卡片被短暂禁用、导致水波纹中断的问题。背景过渡为 280ms，缩放反馈为 320ms；减少动态效果模式下禁用缩放过渡。
- DevTools 内嵌在同一程序窗口右侧，固定占用 800px。显示时窗口增加 800px，隐藏时减去 800px，保留原界面宽度。
- DevTools 左侧增加贯穿面板高度的 1px 灰色分割线，适配浅色和深色外观。
- DevTools 顶栏最右侧补充 × 关闭按钮；菜单 `View → Toggle Developer Tools`、macOS 的 Command + Option + I 和 F12 也可切换显示。
- 关闭右上角的窗口尺寸调试浮层，避免窗口调整大小时显示尺寸文字。

## 开发版验证

| 状态 | 原界面宽度 | DevTools 宽度 | 程序窗口总宽度 |
| --- | ---: | ---: | ---: |
| 目录收起，DevTools 隐藏 | 360px | 0px | 360px |
| 目录收起，DevTools 显示 | 360px | 800px | 1160px |
| 目录展开，DevTools 隐藏 | 1280px | 0px | 1280px |
| 目录展开，DevTools 显示 | 1280px | 800px | 2080px |

- 实际开发窗口中验证了上述四种布局，确认只有一个程序窗口，原界面的视口宽度保持不变。
- 验证手动调整展开宽度至 1100px 后，收起再展开可恢复到 1100px。
- 验证右上角 × 可关闭 DevTools、窗口减少 800px；从菜单重新打开后按钮仍可用。
- 验证卡片水波纹在目录切换时保留并正常结束，CSS 过渡时长为 280ms / 320ms。
- 最终箭头尺寸实测为 16 × 16px，可见尖端与进度条右边缘的计算差约 0.33px。
- 验证尺寸浮层设置保持关闭；模拟 DevTools 重新请求显示尺寸时，实际发送的设置仍为 `show: false`。
- 修改文件通过 ESLint。最终版本在运行中的开发版验证；本轮未重新制作 DMG 安装包。

## 主要代码位置

- `app/containers/HomePage/index.jsx`：卡片与目录显示状态联动。
- `app/containers/HomePage/components/DevicePreview.jsx`：卡片交互与 forward 图标。
- `app/containers/HomePage/styles/DevicePreview.js`：卡片反馈、图标尺寸及对齐。
- `app/containers/HomePage/components/FileExplorer.jsx`、`ToolbarAreaPane.jsx`：目录隐藏时的快捷键保护。
- `app/containers/HomePage/styles/index.js`：设备文件区域的隐藏样式。
- `app/services/file-pane-window.js`：目录展开、收起对应的窗口宽度。
- `app/helpers/developerToolsWindow.js`：内嵌 DevTools、固定宽度、分割线、关闭按钮及尺寸浮层控制。
- `app/main.dev.js`、`app/menu.js`：启动时的窗口配置及开发者工具菜单入口。
