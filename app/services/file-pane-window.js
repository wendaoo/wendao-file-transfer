import { BrowserWindow, ipcMain, screen } from 'electron';
import { getDeveloperToolsWidth } from '../helpers/developerToolsWindow';

export const COMPACT_WIDTH = 360;
export const EXPANDED_WIDTH = 1280;
export const EXPANDED_MIN_WIDTH = 880;

export function registerFilePaneWindow() {
  const states = new WeakMap();
  const getState = (window) => {
    if (!states.has(window))
      states.set(window, { visible: false, expandedWidth: EXPANDED_WIDTH });

    return states.get(window);
  };

  ipcMain.handle('files:window-state', ({ sender }) => {
    const window = BrowserWindow.fromWebContents(sender);

    return window ? getState(window).visible : false;
  });

  ipcMain.handle('files:set-visible', async ({ sender }, visible) => {
    const window = BrowserWindow.fromWebContents(sender);

    if (!window || typeof visible !== 'boolean')
      throw new Error('窗口状态无效');
    const state = getState(window);

    if (state.visible === visible) return visible;
    // Resize only after macOS has returned the window to its normal bounds.
    if (window.isFullScreen()) {
      await new Promise((resolve) => {
        window.once('leave-full-screen', resolve);
        window.setFullScreen(false);
      });
    }

    if (window.isDestroyed()) return state.visible;
    if (window.isMaximized()) window.unmaximize();
    const bounds = window.getBounds();
    const { workArea } = screen.getDisplayMatching(bounds);
    const toolsWidth = getDeveloperToolsWidth(window);
    const availableWidth = Math.max(COMPACT_WIDTH, workArea.width - toolsWidth);

    if (state.visible) state.expandedWidth = bounds.width - toolsWidth;
    const appWidth = visible
      ? Math.min(
          Math.max(state.expandedWidth, EXPANDED_MIN_WIDTH),
          availableWidth
        )
      : COMPACT_WIDTH;
    const width = appWidth + toolsWidth;

    window.setMinimumSize(
      (visible ? Math.min(EXPANDED_MIN_WIDTH, availableWidth) : COMPACT_WIDTH) +
        toolsWidth,
      640
    );
    window.setBounds({
      ...bounds,
      width,
      x: Math.max(
        workArea.x,
        Math.min(bounds.x, workArea.x + workArea.width - width)
      ),
    });
    state.visible = visible;

    return visible;
  });
}
