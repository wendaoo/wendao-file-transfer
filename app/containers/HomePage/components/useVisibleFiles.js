import { useLayoutEffect, useState } from 'react';

// Render only the viewport plus a small buffer; all data remains available for sorting/selection.
export default function useVisibleFiles({
  deviceType,
  path,
  count,
  grid = false,
  selectedIndex = -1,
}) {
  const [viewport, setViewport] = useState({ top: 0, height: 800, width: 800 });
  const rowHeight = grid ? 112 : 40;
  const columns = grid
    ? Math.max(1, Math.floor((viewport.width - 48) / 112))
    : 1;

  useLayoutEffect(() => {
    const element = document.getElementById(
      `file-explorer-body-wrapper-${deviceType}`
    );
    let frame;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        setViewport({
          top: element.scrollTop,
          height: element.clientHeight,
          width:
            element.querySelector('table')?.getBoundingClientRect().width ||
            element.clientWidth,
        })
      );
    };

    element.scrollTop = 0;
    update();
    element.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);

    observer.observe(element);
    const table = element.querySelector('table');

    if (table) observer.observe(table);

    return () => {
      cancelAnimationFrame(frame);
      element.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, [deviceType, path, grid]);
  useLayoutEffect(() => {
    if (selectedIndex < 0) return;
    const element = document.getElementById(
      `file-explorer-body-wrapper-${deviceType}`
    );

    if (element.dataset.marquee === 'true') return;
    const top =
      (grid ? 24 : 0) + Math.floor(selectedIndex / columns) * rowHeight;

    if (top < element.scrollTop) element.scrollTop = top;
    else if (top + rowHeight + 32 > element.scrollTop + element.clientHeight)
      element.scrollTop = top + rowHeight + 32 - element.clientHeight;
  }, [selectedIndex, columns, rowHeight, deviceType, grid]);
  const startRow = Math.max(
    0,
    Math.floor((viewport.top - 32 - (grid ? 24 : 0)) / rowHeight) - 5
  );
  const start =
    Math.min(Math.max(0, Math.ceil(count / columns) - 1), startRow) * columns;
  const end = Math.min(
    count,
    start + (Math.ceil(viewport.height / rowHeight) + 11) * columns
  );

  return {
    start,
    end,
    before: (start / columns) * rowHeight,
    after: Math.ceil((count - end) / columns) * rowHeight,
  };
}
