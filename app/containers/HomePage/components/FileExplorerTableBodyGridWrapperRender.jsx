import React from 'react';
import pick from 'lodash/pick';
import { withStyles } from '@material-ui/core/styles';
import TableCell from '@material-ui/core/TableCell';
import TableRow from '@material-ui/core/TableRow';
import FileExplorerTableGridRender from './FileExplorerTableBodyGridRender';
import { styles } from '../styles/FileExplorerTableBodyGridWrapperRender';
import useVisibleFiles from './useVisibleFiles';

function FileExplorerTableBodyGridWrapperRender(props) {
  const { classes, tableSort, directoryLists, deviceType, tableData } = props;
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
    grid: true,
  });

  return (
    <TableRow>
      <TableCell
        colSpan={
          2 +
          ['name', 'size', 'dateAdded'].filter(
            (id) => !hideColList.includes(id)
          ).length
        }
        className={classes.gridTableCell}
      >
        <div style={{ height: before }} />
        <div className={classes.wrapper}>
          {tableSort.slice(start, end).map((item) => (
            <FileExplorerTableGridRender
              {...rowProps}
              deviceType={deviceType}
              key={item.path}
              item={item}
              isSelected={selected.has(item.path)}
            />
          ))}
        </div>
        <div style={{ height: after }} />
      </TableCell>
    </TableRow>
  );
}

export default withStyles(styles)(FileExplorerTableBodyGridWrapperRender);
