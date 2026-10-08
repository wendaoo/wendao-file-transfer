import React, { useEffect, useRef, useState } from 'react';
import { FILE_EXPLORER_VIEW_TYPE } from '../../../enums';

export default function FileMarquee(props) {
  const latest = useRef(props);
  const [box, setBox] = useState(null);
  const { wrapperId, deviceType, currentBrowsePath, fileExplorerListingType } =
    props;
  const path = currentBrowsePath[deviceType];
  const view = fileExplorerListingType[deviceType];

  latest.current = props;
  useEffect(() => {
    const element = document.getElementById(wrapperId);
    let gesture;
    let frame;
    const select = (paths) =>
      latest.current.onSelectionChange(paths, deviceType);
    const finish = () => {
      cancelAnimationFrame(frame);
      const id = gesture?.id;

      gesture = null;
      delete element.dataset.marquee;
      if (id !== undefined && element.hasPointerCapture(id))
        element.releasePointerCapture(id);
      setBox(null);
    };
    const draw = () => {
      if (!gesture) return;
      const bounds = element.getBoundingClientRect();
      const top = bounds.top + 32;
      const bottom = bounds.top + element.clientHeight;
      const right = bounds.left + element.clientWidth;
      const { mouseX, mouseY } = gesture;
      const scroll = mouseY > bottom - 24 ? 12 : mouseY < top + 24 ? -12 : 0;

      if (gesture.moved) element.scrollTop += scroll;
      const x =
        Math.max(bounds.left, Math.min(right, mouseX)) -
        bounds.left +
        element.scrollLeft;
      const y =
        Math.max(top, Math.min(bottom, mouseY)) -
        bounds.top +
        element.scrollTop;
      const left = Math.min(gesture.x, x);
      const upper = Math.min(gesture.y, y);
      const farRight = Math.max(gesture.x, x);
      const lower = Math.max(gesture.y, y);

      if (gesture.moved) {
        const selected = gesture.nodes
          .filter((_, index) => {
            const col = index % gesture.columns;
            const row = Math.floor(index / gesture.columns);
            const itemLeft = gesture.originX + col * gesture.itemWidth;
            const itemTop = gesture.originY + row * gesture.itemHeight;

            return (
              itemLeft < farRight &&
              itemLeft + gesture.itemWidth > left &&
              itemTop < lower &&
              itemTop + gesture.itemHeight > upper
            );
          })
          .map((item) => item.path);
        const next = [...new Set([...gesture.base, ...selected])];
        const signature = JSON.stringify(next);

        if (signature !== gesture.signature) {
          gesture.signature = signature;
          select(next);
        }

        const visibleLeft = Math.max(
          bounds.left,
          left + bounds.left - element.scrollLeft
        );
        const visibleTop = Math.max(
          top,
          upper + bounds.top - element.scrollTop
        );

        setBox({
          left: visibleLeft,
          top: visibleTop,
          width: Math.max(
            0,
            Math.min(right, farRight + bounds.left - element.scrollLeft) -
              visibleLeft
          ),
          height: Math.max(
            0,
            Math.min(bottom, lower + bounds.top - element.scrollTop) -
              visibleTop
          ),
        });
      }

      frame = requestAnimationFrame(draw);
    };
    const down = (event) => {
      if (
        event.button !== 0 ||
        event.pointerType !== 'mouse' ||
        event.target.closest(
          '[data-file-path], thead, button, input, a, [role="button"]'
        )
      )
        return;
      const bounds = element.getBoundingClientRect();

      if (
        event.clientX >= bounds.left + element.clientWidth ||
        event.clientY >= bounds.top + element.clientHeight ||
        event.clientY < bounds.top + 32
      )
        return;
      const body = element.querySelector('tbody');

      if (!body) return;
      const { directoryLists, tableSort } = latest.current;
      const { nodes, order, orderBy, queue } = directoryLists[deviceType];
      const grid = view === FILE_EXPLORER_VIEW_TYPE.grid;
      const bodyBounds = body.getBoundingClientRect();
      const original = [...queue.selected];
      const base =
        event.metaKey || event.ctrlKey || event.shiftKey ? original : [];

      event.preventDefault();
      element.focus();
      gesture = {
        id: event.pointerId,
        x: event.clientX - bounds.left + element.scrollLeft,
        y: event.clientY - bounds.top + element.scrollTop,
        mouseX: event.clientX,
        mouseY: event.clientY,
        startX: event.clientX,
        startY: event.clientY,
        original,
        base,
        nodes: tableSort({ nodes, order, orderBy }),
        columns: grid
          ? Math.max(1, Math.floor((bodyBounds.width - 48) / 112))
          : 1,
        itemWidth: grid ? 112 : bodyBounds.width,
        itemHeight: grid ? 112 : 40,
        originX:
          bodyBounds.left - bounds.left + element.scrollLeft + (grid ? 24 : 0),
        originY:
          bodyBounds.top - bounds.top + element.scrollTop + (grid ? 24 : 0),
        moved: false,
      };
      element.dataset.marquee = 'true';
      element.setPointerCapture(event.pointerId);
      select(base);
      frame = requestAnimationFrame(draw);
    };
    const move = (event) => {
      if (!gesture || event.pointerId !== gesture.id) return;
      gesture.mouseX = event.clientX;
      gesture.mouseY = event.clientY;
      gesture.moved =
        gesture.moved ||
        Math.hypot(
          event.clientX - gesture.startX,
          event.clientY - gesture.startY
        ) > 4;
      cancelAnimationFrame(frame);
      draw();
    };
    const up = (event) => {
      move(event);
      finish();
    };
    const cancel = () => {
      if (gesture) select(gesture.original);
      finish();
    };
    const key = (event) => {
      if (event.key === 'Escape' && gesture) {
        event.preventDefault();
        cancel();
      }
    };
    const drag = (event) => {
      if (gesture) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    element.addEventListener('pointerdown', down);
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    element.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cancel);
    element.addEventListener('dragstart', drag, true);
    document.addEventListener('keydown', key);

    return () => {
      element.removeEventListener('pointerdown', down);
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      element.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
      element.removeEventListener('dragstart', drag, true);
      document.removeEventListener('keydown', key);
      finish();
    };
  }, [wrapperId, deviceType, path, view]);

  return box ? (
    <div
      aria-hidden="true"
      style={{
        ...box,
        position: 'fixed',
        pointerEvents: 'none',
        zIndex: 20,
        border: '1px solid #5686e5',
        background: 'rgba(86, 134, 229, .16)',
        boxSizing: 'border-box',
      }}
    />
  ) : null;
}
