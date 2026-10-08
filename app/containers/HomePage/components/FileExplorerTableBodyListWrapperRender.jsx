import React from 'react';
import pick from 'lodash/pick';
import FileExplorerTableRowsRender from './FileExplorerTableBodyListRender';
import useVisibleFiles from './useVisibleFiles';

export default function FileExplorerTableBodyListWrapperRender(props) {
  const { tableSort, directoryLists, deviceType, tableData } = props;
  const rowProps = pick(props, [
    '_eventTarget',
    'tableData',
    'mtpDevice',
    'hideColList',
    'onContextMenuClick',
    'onTableClick',
    'onTableDoubleClick',
  ]);
  const { hideColList } = props;
  const selected = new Set(directoryLists[deviceType].queue.selected);
  const { start, end, before, after } = useVisibleFiles({
    deviceType,
    path: tableData.path,
    count: tableSort.length,
    selectedIndex:
      selected.size === 1
        ? tableSort.findIndex((item) => selected.has(item.path))
        : -1,
  });
  const spacer = (height) =>
    height > 0 && (
      <tr aria-hidden="true">
        <td
          colSpan={5 - hideColList.length}
          style={{ height, padding: 0, border: 0 }}
        />
      </tr>
    );

  return (
    <>
      {spacer(before)}
      {tableSort.slice(start, end).map((item) => (
        <FileExplorerTableRowsRender
          {...rowProps}
          deviceType={deviceType}
          key={item.path}
          item={item}
          isSelected={selected.has(item.path)}
        />
      ))}
      {spacer(after)}
    </>
  );
}
