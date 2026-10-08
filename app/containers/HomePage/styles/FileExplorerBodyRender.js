import { mixins } from '../../../styles/js';

export const styles = (theme) => ({
  root: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    ...mixins({ theme }).noselect,
  },
  pathRow: {
    height: 32,
    flexShrink: 0,
    overflow: 'hidden',
    WebkitAppRegion: 'no-drag',
  },
  tableWrapper: {
    position: 'relative',
    ...mixins({ theme }).noOutline,
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    overflowX: 'auto',
    backgroundImage: `linear-gradient(to bottom, ${theme.palette.tableHeaderFooterBgColor} 31px, ${theme.palette.fileExplorerThinLineDividerColor} 31px, ${theme.palette.fileExplorerThinLineDividerColor} 32px, ${theme.palette.background.paper} 32px)`,
    '&::-webkit-scrollbar': {
      width: 12,
      height: 12,
      background: `linear-gradient(to bottom, ${theme.palette.tableHeaderFooterBgColor} 32px, ${theme.palette.background.paper} 32px)`,
    },
    '&::-webkit-scrollbar-track': { background: 'transparent' },
    '&::-webkit-scrollbar-track:vertical': { marginTop: 32 },
    '&::-webkit-scrollbar-thumb, &::-webkit-scrollbar-thumb:hover': {
      backgroundColor: 'transparent',
      border: '4px solid transparent',
      minHeight: 100,
    },
    '&.isScrolling::-webkit-scrollbar-thumb': {
      backgroundColor: '#b0b0b6',
      borderColor: theme.palette.background.paper,
    },
    '&::-webkit-scrollbar-thumb:hover, &.isScrolling::-webkit-scrollbar-thumb:hover':
      {
        backgroundColor: '#85858b',
        borderColor: theme.palette.background.paper,
        borderWidth: 1,
        borderRightWidth: 2,
      },
    '&::-webkit-scrollbar-thumb:active, &.isScrolling::-webkit-scrollbar-thumb:active':
      {
        backgroundColor: '#85858b',
        borderColor: theme.palette.background.paper,
        borderWidth: 1,
        borderRightWidth: 2,
      },
    '&::-webkit-scrollbar-corner': {
      background: theme.palette.background.paper,
    },
    borderBottom: `solid 1px ${theme.palette.fileExplorerThinLineDividerColor}`,
    [`&.onHoverDropZone`]: {
      backgroundColor: theme.palette.fileDrop,
    },
  },
});
