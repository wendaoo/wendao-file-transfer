import { BrowserView, screen } from 'electron';

const toolViews = new WeakMap();

export const DEVTOOLS_WIDTH = 800;

const HIDE_VIEWPORT_SIZE_SCRIPT = `
  (async () => {
    if (window.__openmtpViewportSizeHidden) return;
    const sdk = await import('./core/sdk/sdk.js');
    sdk.TargetManager.TargetManager.instance().observeModels(
      sdk.OverlayModel.OverlayModel,
      {
        modelAdded(model) {
          const setShow = model.setShowViewportSizeOnResize.bind(model);
          model.setShowViewportSizeOnResize = () => setShow(false);
          model.setShowViewportSizeOnResize();
        },
        modelRemoved() {},
      }
    );
    window.__openmtpViewportSizeHidden = true;
  })()
`;

const DEVTOOLS_DIVIDER_CSS = `
  body::after {
    content: '';
    position: fixed;
    top: 0;
    bottom: 0;
    left: 0;
    width: 1px;
    background: #aeb4bd;
    pointer-events: none;
    z-index: 2147483647;
  }
  @media (prefers-color-scheme: dark) {
    body::after { background: #59616c; }
  }
`;

// Runs inside the inspector, whose toolbar is nested in shadow roots.
async function installCloseButton() {
  const find = (root, selector) => {
    const match = root.querySelector(selector);

    if (match) return match;
    for (const element of root.querySelectorAll('*')) {
      if (element.shadowRoot) {
        const nested = find(element.shadowRoot, selector);

        if (nested) return nested;
      }
    }

    return null;
  };

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const pane = find(document, '.main-tabbed-pane');
    const toolbar =
      pane &&
      pane.shadowRoot &&
      find(pane.shadowRoot, '.tabbed-pane-right-toolbar');
    const container =
      toolbar &&
      toolbar.shadowRoot &&
      toolbar.shadowRoot.querySelector('.toolbar-shadow');

    if (container) {
      if (container.querySelector('#openmtp-close-devtools')) return;
      const button = document.createElement('button');

      button.id = 'openmtp-close-devtools';
      button.type = 'button';
      button.className = 'toolbar-button toolbar-item';
      button.title = '关闭 DevTools（⌘⌥I / F12）';
      button.setAttribute('aria-label', '关闭 DevTools');
      button.style.cssText =
        'width:28px;min-width:28px;font-size:20px;line-height:20px;cursor:pointer;';
      button.textContent = '×';
      button.addEventListener('click', () => {
        // The inspector has no Node integration; only its own view handles this signal.
        console.info('openmtp:devtools-close');
      });
      container.appendChild(button);

      return;
    }

    // The inspector creates its toolbar after the document finishes loading.
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error('未找到开发者工具栏');
}

export const getDeveloperToolsWidth = (window) =>
  toolViews.get(window)?.visible ? DEVTOOLS_WIDTH : 0;

function layoutDeveloperTools(window) {
  const state = toolViews.get(window);

  if (!state || window.isDestroyed()) return;
  if (!state.visible) {
    window.webContents.disableDeviceEmulation();

    return;
  }

  const [width, height] = window.getContentSize();
  const appWidth = Math.max(1, width - DEVTOOLS_WIDTH);

  state.view.setBounds({ x: appWidth, y: 0, width: DEVTOOLS_WIDTH, height });
  // Keep the app's CSS viewport identical to its width without the inspector.
  window.webContents.enableDeviceEmulation({
    screenPosition: 'desktop',
    screenSize: { width: appWidth, height },
    deviceScaleFactor: 0,
    viewPosition: { x: 0, y: 0 },
    viewSize: { width: appWidth, height },
    scale: 1,
  });
}

function setDeveloperToolsVisible(window, visible) {
  const state = toolViews.get(window);

  if (!state || state.visible === visible) return;
  const bounds = window.getBounds();
  const [minWidth, minHeight] = window.getMinimumSize();
  const delta = visible ? DEVTOOLS_WIDTH : -DEVTOOLS_WIDTH;
  const width = bounds.width + delta;
  const { workArea } = screen.getDisplayMatching(bounds);

  state.visible = visible;
  if (visible) window.addBrowserView(state.view);
  else window.removeBrowserView(state.view);
  window.setMinimumSize(minWidth + delta, minHeight);
  window.setBounds({
    ...bounds,
    width,
    x: Math.max(
      workArea.x,
      Math.min(bounds.x, workArea.x + workArea.width - width)
    ),
  });
  layoutDeveloperTools(window);
}

export function openDeveloperTools(window) {
  const state = toolViews.get(window);

  if (!state) return;
  setDeveloperToolsVisible(window, true);
  if (!state.view.webContents.getURL().startsWith('devtools:'))
    window.webContents.openDevTools({ mode: 'detach', activate: false });
}

export function toggleDeveloperTools(window) {
  if (toolViews.get(window)?.visible) setDeveloperToolsVisible(window, false);
  else openDeveloperTools(window);
}

export function attachDeveloperToolsWindow(window) {
  const view = new BrowserView({ webPreferences: { devTools: false } });

  view.webContents.on('did-finish-load', () => {
    view.webContents
      .executeJavaScript(HIDE_VIEWPORT_SIZE_SCRIPT)
      .catch((error) => {
        console.error('无法隐藏窗口尺寸提示', error);
      });
    view.webContents.insertCSS(DEVTOOLS_DIVIDER_CSS).catch((error) => {
      console.error('无法显示开发者工具分割线', error);
    });
    view.webContents
      .executeJavaScript(`(${installCloseButton.toString()})()`)
      .catch((error) => console.error('无法显示开发者工具关闭按钮', error));
  });
  view.webContents.on('console-message', (_event, _level, message) => {
    if (message === 'openmtp:devtools-close')
      setDeveloperToolsVisible(window, false);
  });
  toolViews.set(window, { view, visible: false });
  window.webContents.setDevToolsWebContents(view.webContents);
  window.on('resize', () => layoutDeveloperTools(window));
  window.webContents.on('did-finish-load', () => layoutDeveloperTools(window));
  window.webContents.once('did-finish-load', () => openDeveloperTools(window));
  window.on('closed', () => {
    toolViews.delete(window);
    if (!view.webContents.isDestroyed()) view.webContents.destroy();
  });
  const handleShortcut = (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F12') {
      event.preventDefault();
      toggleDeveloperTools(window);
    } else if (input.key === 'F5') {
      event.preventDefault();
      window.webContents.reloadIgnoringCache();
    }
  };

  window.webContents.on('before-input-event', handleShortcut);
  view.webContents.on('before-input-event', handleShortcut);
}
