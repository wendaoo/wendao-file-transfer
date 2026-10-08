import React, { PureComponent } from 'react';
import { withStyles } from '@material-ui/core/styles';
import TableCell from '@material-ui/core/TableCell';
import TableRow from '@material-ui/core/TableRow';
import Checkbox from '@material-ui/core/Checkbox';
import Tooltip from '@material-ui/core/Tooltip';
import classNames from 'classnames';
import { niceBytes, springTruncate } from '../../../utils/funcs';
import { FILE_EXPLORER_TABLE_TRUNCATE_MAX_CHARS } from '../../../constants';
import { styles } from '../styles/FileExplorerTableBodyListRender';
// eslint-disable-next-line import/no-relative-packages
import prettyFileIcons from '../../../vendors/pretty-file-icons';
import { imgsrc } from '../../../utils/imgsrc';
import { appDateFormat } from '../../../utils/date';
import DeviceThumbnail from './DeviceThumbnail';

class FileExplorerTableBodyListRender extends PureComponent {
  RenderFileIcon = () => {
    const { classes: styles, item, mtpDevice } = this.props;

    const fileIcon = prettyFileIcons.getIcon(item.name, 'svg');

    return (
      <div className={styles.fileTypeIconWrapper}>
        <DeviceThumbnail
          item={item}
          device={mtpDevice}
          thumbnailClassName={styles.thumbnail}
          src={imgsrc(`file-types/${fileIcon}`)}
          alt={item.name}
          className={classNames(styles.fileTypeIcon)}
        />
      </div>
    );
  };

  RenderFolderIcon = () => {
    const { classes: styles, item } = this.props;

    return (
      <div className={styles.fileTypeIconWrapper}>
        <img
          src={imgsrc(`FileExplorer/folder-blue.svg`)}
          alt={item.name}
          className={classNames(styles.fileTypeIcon)}
        />
      </div>
    );
  };

  render() {
    const {
      classes: styles,
      isSelected,
      item,
      deviceType,
      _eventTarget,
      tableData,
      hideColList,
      onContextMenuClick,
      onTableClick,
      onTableDoubleClick,
    } = this.props;

    const { RenderFileIcon, RenderFolderIcon } = this;

    const fileName = springTruncate(
      item.name,
      FILE_EXPLORER_TABLE_TRUNCATE_MAX_CHARS
    );

    return (
      <TableRow
        data-file-path={item.path}
        onDoubleClick={(event) => {
          if (!event.target.closest('.checkboxCell'))
            onTableDoubleClick(item, deviceType, event);
        }}
        draggable
        hover
        role="checkbox"
        aria-checked={isSelected}
        tabIndex={-1}
        selected={isSelected}
        className={classNames({
          [styles.tableRowSelected]: isSelected,
        })}
        onDragStart={(event) => {
          if (!isSelected) {
            onTableClick(item.path, deviceType, event);
          }
        }}
      >
        <TableCell
          padding="none"
          className={`${styles.tableCell} checkboxCell`}
          onContextMenu={(event) =>
            onContextMenuClick(
              event,
              { ...item },
              { ...tableData },
              _eventTarget
            )
          }
        >
          <Checkbox
            checked={isSelected}
            onClick={(event) => onTableClick(item.path, deviceType, event)}
          />
        </TableCell>
        {hideColList.indexOf('name') < 0 && (
          <TableCell
            padding="default"
            onClick={(event) => onTableClick(item.path, deviceType, event)}
            className={`${styles.tableCell} nameCell`}
            onContextMenu={(event) =>
              onContextMenuClick(
                event,
                { ...item },
                { ...tableData },
                _eventTarget
              )
            }
          >
            {item.isFolder ? <RenderFolderIcon /> : <RenderFileIcon />}
            &nbsp;&nbsp;
            {fileName.isTruncated ? (
              <Tooltip title={fileName.text}>
                <div className={styles.truncate}>{fileName.truncatedText}</div>
              </Tooltip>
            ) : (
              fileName.text
            )}
          </TableCell>
        )}
        {hideColList.indexOf('size') < 0 && (
          <TableCell
            padding="none"
            onClick={(event) => onTableClick(item.path, deviceType, event)}
            className={`${styles.tableCell} sizeCell`}
            onContextMenu={(event) =>
              onContextMenuClick(
                event,
                { ...item },
                { ...tableData },
                _eventTarget
              )
            }
          >
            {item.isFolder ? `--` : `${niceBytes(item.size)}`}
          </TableCell>
        )}
        {hideColList.indexOf('dateAdded') < 0 && (
          <TableCell
            padding="none"
            onClick={(event) => onTableClick(item.path, deviceType, event)}
            className={`${styles.tableCell} dateAddedCell`}
            onContextMenu={(event) =>
              onContextMenuClick(
                event,
                { ...item },
                { ...tableData },
                _eventTarget
              )
            }
          >
            {item.isAppRoot ? '--' : appDateFormat(item.dateAdded)}
          </TableCell>
        )}
        <TableCell padding="none" className={styles.tableCell} />
      </TableRow>
    );
  }
}

export default withStyles(styles)(FileExplorerTableBodyListRender);
