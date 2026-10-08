import { mixins } from '../../../styles/js';
import { tableCellFileExplorerTableRowsRender } from './FileExplorerTableBodyListRender';

export const styles = (theme) => ({
  emptyTableRowWrapper: {},
  contentMessage: {
    padding: '72px 24px',
    textAlign: 'center',
    whiteSpace: 'normal',
    color: theme.palette.text.secondary,
  },
  loadingMessage: {
    position: 'absolute',
    top: 32,
    right: 0,
    bottom: 0,
    left: 0,
    padding: 24,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    boxSizing: 'border-box',
    pointerEvents: 'none',
  },
  loadingIcon: { marginBottom: 16, color: theme.palette.text.secondary },
  contentTitle: { margin: '0 0 10px', fontSize: 14, fontWeight: 500 },
  contentDescription: {
    margin: '0 auto',
    maxWidth: 440,
    fontSize: 12,
    lineHeight: 1.8,
  },
  tableCell: tableCellFileExplorerTableRowsRender,
  helpPhoneNotRecognized: {
    width: '100%',
    ...mixins({ theme }).center,
    color: theme.palette.snackbar.error,
    fontWeight: 600,
  },
  noMtp: {
    marginTop: 10,
  },
  instructions: {
    marginTop: 5,
    lineHeight: `18px`,
    paddingLeft: 30,
    color: `rgba(0, 0, 0, 0.8)`,
  },
  nestedPanel: {
    paddingLeft: 16,
    paddingRight: 16,
  },
  divider: {
    marginTop: 10,
    marginBottom: 10,
  },
});
