import React, { PureComponent } from 'react';
import { withStyles } from '@material-ui/core/styles';
import Table from '@material-ui/core/Table';
import TableBody from '@material-ui/core/TableBody';
import FileExplorerTableHeadRender from './FileExplorerTableHeadRender';
import FileExplorerTableEmptyRowRender from './FileExplorerTableBodyEmptyRender';
import FileExplorerTableBodyGridWrapperRender from './FileExplorerTableBodyGridWrapperRender';
import FileExplorerTableBodyListWrapperRender from './FileExplorerTableBodyListWrapperRender';
import { styles } from '../styles/FileExplorerTableBodyRender';
import { DEVICE_TYPE, FILE_EXPLORER_VIEW_TYPE } from '../../../enums';

class FileExplorerTableBodyRender extends PureComponent {
  constructor(props) {
    super(props);
    this.state = { columnWidths: null };
  }

  setColumnWidths = (columnWidths) => this.setState({ columnWidths });

  isSelected = (path) => {
    const { directoryLists, deviceType } = this.props;
    const _directoryLists = directoryLists[deviceType].queue.selected;

    return _directoryLists.indexOf(path) !== -1;
  };

  ListingSwitcher = (type = FILE_EXPLORER_VIEW_TYPE.grid) => {
    const { deviceType, directoryLists, tableSort } = this.props;
    const { nodes, order, orderBy } = directoryLists[deviceType];
    const _eventTarget = 'tableCellTarget';

    // eslint-disable-next-line  no-unused-vars
    const { classes, ...parentProps } = this.props;

    switch (type) {
      case FILE_EXPLORER_VIEW_TYPE.list:
        return (
          <FileExplorerTableBodyListWrapperRender
            {...parentProps}
            tableSort={tableSort({
              nodes,
              order,
              orderBy,
            })}
            _eventTarget={_eventTarget}
            isSelected={this.isSelected}
          />
        );

      case FILE_EXPLORER_VIEW_TYPE.grid:
      default:
        return (
          <FileExplorerTableBodyGridWrapperRender
            {...parentProps}
            tableSort={tableSort({
              nodes,
              order,
              orderBy,
            })}
            _eventTarget={_eventTarget}
            isSelected={this.isSelected}
          />
        );
    }
  };

  render() {
    const {
      classes: styles,
      deviceType,
      fileExplorerListingType,
      hideColList,
      currentBrowsePath,
      directoryLists,
      mtpDevice,
      onSelectAllClick,
      onRequestSort,
      onContextMenuClick,
      onIsDraggable,
      onDragStart,
    } = this.props;
    const { nodes, order, orderBy, queue } = directoryLists[deviceType];
    const { selected } = queue;
    const isMtp = deviceType === DEVICE_TYPE.mtp;
    const emptyRows = nodes.length < 1 || (isMtp && mtpDevice.isLoading);

    const columns = ['name', 'size', 'dateAdded'].filter(
      (id) => !hideColList.includes(id)
    );
    const { columnWidths } = this.state;
    const defaults = { name: 'auto', size: 140, dateAdded: 200 };

    return (
      <Table
        className={styles.table}
        style={{
          tableLayout: 'fixed',
          minWidth: '100%',
          width: columnWidths
            ? 56 +
              columns.reduce(
                (sum, id) => sum + (columnWidths[id] || defaults[id]),
                0
              )
            : '100%',
        }}
      >
        <colgroup>
          <col style={{ width: 56 }} />
          {columns.map((id) => (
            <col
              key={id}
              style={{ width: columnWidths?.[id] || defaults[id] }}
            />
          ))}
          <col style={{ width: columnWidths ? undefined : 0 }} />
        </colgroup>
        <FileExplorerTableHeadRender
          resizable
          onColumnWidths={this.setColumnWidths}
          numSelected={selected.length}
          order={order}
          orderBy={orderBy}
          onSelectAllClick={onSelectAllClick.bind(this, deviceType)}
          onRequestSort={onRequestSort.bind(this, deviceType)}
          rowCount={nodes ? nodes.length : 0}
          hideColList={hideColList}
        />
        <TableBody
          draggable={onIsDraggable(deviceType)}
          onDragStart={(event) => {
            onDragStart(event, {
              sourceDeviceType: deviceType,
            });
          }}
        >
          {emptyRows ? (
            <FileExplorerTableEmptyRowRender
              columnCount={columns.length + 2}
              mtpDevice={mtpDevice}
              isMtp={isMtp}
              currentBrowsePath={currentBrowsePath}
              deviceType={deviceType}
              directoryLists={directoryLists}
              onContextMenuClick={onContextMenuClick}
            />
          ) : (
            this.ListingSwitcher(fileExplorerListingType[deviceType])
          )}
        </TableBody>
      </Table>
    );
  }
}

export default withStyles(styles)(FileExplorerTableBodyRender);
