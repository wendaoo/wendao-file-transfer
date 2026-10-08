import { mixins } from '../../../styles/js';

export const styles = (theme) => {
  return {
    root: {
      width: `100%`,
      height: `100%`,
    },

    rootBreadcrumbs: {
      '& > div': { height: '100%' },
      width: `100%`,
      height: `100%`,
    },

    breadcrumb: {
      ...mixins({ theme }).resetUl,
      height: '100%',
      boxSizing: 'border-box',
      overflowX: 'auto',
      overflowY: 'hidden',
      '&::-webkit-scrollbar': { height: 0 },
      padding: '0 24px',
      backgroundColor: theme.palette.tableHeaderFooterBgColor,
      display: 'flex',
      alignItems: 'center',
      '& > span': {
        display: 'flex',
        alignItems: 'center',
        height: 20,
        flexShrink: 0,
      },
    },

    breadcrumbLi: {
      display: 'inline-block',
      padding: 0,
      lineHeight: '20px',
      overflow: 'visible',
      fontSize: 12,
      flexShrink: 0,
      whiteSpace: 'nowrap',
    },

    breadcrumbLiA: {
      cursor: `pointer`,
      color: theme.palette.secondary.main,
      textDecoration: 'none',
      [`&.bold`]: {
        fontWeight: `bold`,
      },
    },
    breadcrumbSeperator: {
      fontSize: 18,
      display: 'block',
    },
  };
};
