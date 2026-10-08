export const isAppNavigation = (candidate, appUrl) => {
  try {
    const parsed = new URL(candidate);
    const expected = new URL(appUrl);

    parsed.hash = '';
    expected.hash = '';

    return parsed.href === expected.href;
  } catch (error) {
    return false;
  }
};

export function protectWebContents(contents, appUrl) {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const guardNavigation = (event, url) => {
    if (!isAppNavigation(url, appUrl)) event.preventDefault();
  };

  contents.on('will-navigate', guardNavigation);
  contents.on('will-redirect', guardNavigation);
  contents.on('will-attach-webview', (event) => event.preventDefault());
}
