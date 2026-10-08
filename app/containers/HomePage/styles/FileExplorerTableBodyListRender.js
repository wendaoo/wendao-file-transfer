export const tableCellFileExplorerTableRowsRender = {
  height: 40,
  boxSizing: 'border-box',
  fontSize: 13,
  paddingTop: 0,
  paddingBottom: 0,
  '& .MuiCheckbox-root': { padding: 4, '& svg': { fontSize: 18 } },
  borderBottom: `unset`,
  paddingLeft: 12,
  paddingRight: 12,
  [`&.checkboxCell`]: {
    width: 56,
    paddingLeft: 17,
    paddingRight: 7,
  },
  [`&.nameCell`]: {
    display: 'table-cell',
    whiteSpace: `nowrap`,
    overflow: `hidden`,
    textOverflow: `ellipsis`,
  },
  [`&.sizeCell`]: {
    whiteSpace: `nowrap`,
    overflow: `hidden`,
    textOverflow: `ellipsis`,
    width: `auto`,
    minWidth: 100,
  },
  [`&.dateAddedCell`]: {
    whiteSpace: `nowrap`,
    overflow: `hidden`,
    textOverflow: `ellipsis`,
    width: `auto`,
    minWidth: 100,
    paddingRight: 10,
  },
};

export const styles = (theme) => {
  return {
    tableRowSelected: {
      backgroundColor: 'rgba(41, 121, 255, 0.15) !important',
    },
    tableCell: {
      ...tableCellFileExplorerTableRowsRender,
      color: theme.palette.contrastPrimaryMainColor,
    },
    fileTypeIconWrapper: {
      display: 'inline-block',
      verticalAlign: 'middle',
      paddingTop: 0,
      paddingBottom: 0,
      paddingLeft: 2,
      textAlign: 'center',
    },
    thumbnail: {
      width: 24,
      height: 24,
      objectFit: 'contain',
      verticalAlign: 'middle',
      borderRadius: 2,
    },
    fileTypeIcon: {
      verticalAlign: `middle`,
      height: 20,
      width: 'auto',
    },
    truncate: {
      textOverflow: 'ellipsis',
      overflow: 'hidden',
      display: 'inline',
      whiteSpace: 'nowrap',
    },
  };
};
