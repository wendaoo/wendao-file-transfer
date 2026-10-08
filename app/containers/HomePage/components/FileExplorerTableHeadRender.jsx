import React, { PureComponent, Fragment } from 'react';
import { withStyles } from '@material-ui/core/styles';
import TableCell from '@material-ui/core/TableCell';
import TableHead from '@material-ui/core/TableHead';
import TableRow from '@material-ui/core/TableRow';
import TableSortLabel from '@material-ui/core/TableSortLabel';
import Checkbox from '@material-ui/core/Checkbox';
import Tooltip from '@material-ui/core/Tooltip';
import { styles } from '../styles/FileExplorerTableHeadRender';

const rows = [
  {
    id: 'name',
    numeric: false,
    disablePadding: false,
    label: '名称',
  },
  {
    id: 'size',
    numeric: false,
    disablePadding: true,
    label: '大小',
  },
  {
    // for legacy kernel it is date added while for kalam kernel it is modified time
    id: 'dateAdded',
    numeric: false,
    disablePadding: true,
    label: '日期',
  },
];

class FileExplorerTableHeadRender extends PureComponent {
  resize = null;

  measureColumns = (target) =>
    Object.fromEntries(
      Array.from(target.closest('tr').querySelectorAll('[data-column]')).map(
        (cell) => [cell.dataset.column, cell.getBoundingClientRect().width]
      )
    );

  startResize = (event, id) => {
    event.preventDefault();
    event.stopPropagation();
    const widths = this.measureColumns(event.currentTarget);

    this.resize = { id, start: event.clientX, widths };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  moveResize = (event) => {
    if (!this.resize) return;
    const { id, start, widths } = this.resize;
    const { onColumnWidths } = this.props;

    onColumnWidths({
      ...widths,
      [id]: Math.max(
        id === 'name' ? 140 : 90,
        widths[id] + event.clientX - start
      ),
    });
  };

  endResize = () => {
    this.resize = null;
  };

  createSortHandler = (property) => (event) => {
    const { onRequestSort } = this.props;

    onRequestSort(property, event);
  };

  render() {
    const {
      classes: styles,
      onSelectAllClick,
      order,
      orderBy,
      numSelected,
      rowCount,
      hideColList,
      resizable,
      onColumnWidths,
    } = this.props;

    return (
      <TableHead>
        <TableRow>
          <TableCell padding="none" className={styles.tableHeadCell}>
            <Checkbox
              indeterminate={numSelected > 0 && numSelected < rowCount}
              checked={rowCount > 0 && numSelected === rowCount}
              onChange={onSelectAllClick}
            />
          </TableCell>
          {rows.map((row) => {
            return hideColList.indexOf(row.id) < 0 ? (
              <TableCell
                key={row.id}
                data-column={row.id}
                align={row.numeric ? 'right' : 'inherit'}
                padding={row.disablePadding ? 'none' : 'default'}
                sortDirection={orderBy === row.id ? order : false}
                className={styles.tableHeadCell}
              >
                <Tooltip
                  title="排序"
                  placement={row.numeric ? 'bottom-end' : 'bottom-start'}
                  enterDelay={300}
                >
                  <TableSortLabel
                    active={orderBy === row.id}
                    direction={order}
                    onClick={this.createSortHandler(row.id)}
                  >
                    {row.label}
                  </TableSortLabel>
                </Tooltip>
                {resizable && (
                  <div
                    className={styles.resizeHandle}
                    role="button"
                    aria-label={`调整 ${row.label} 列宽`}
                    tabIndex={0}
                    onClick={(event) => event.stopPropagation()}
                    onPointerDown={(event) => this.startResize(event, row.id)}
                    onPointerMove={this.moveResize}
                    onPointerUp={this.endResize}
                    onPointerCancel={this.endResize}
                    onLostPointerCapture={this.endResize}
                    onKeyDown={(event) => {
                      if (!['ArrowLeft', 'ArrowRight'].includes(event.key))
                        return;
                      event.preventDefault();
                      event.stopPropagation();
                      const widths = this.measureColumns(event.currentTarget);

                      onColumnWidths({
                        ...widths,
                        [row.id]: Math.max(
                          row.id === 'name' ? 140 : 90,
                          widths[row.id] +
                            (event.key === 'ArrowRight' ? 16 : -16)
                        ),
                      });
                    }}
                  />
                )}
              </TableCell>
            ) : (
              <Fragment key={row.id} />
            );
          }, this)}
          {resizable && (
            <TableCell
              padding="none"
              className={styles.tableHeadCell}
              style={{ padding: 0 }}
              aria-hidden="true"
            />
          )}
        </TableRow>
      </TableHead>
    );
  }
}

export default withStyles(styles)(FileExplorerTableHeadRender);
