export const styles = (theme) => ({
  margin: {},
  root: {},
  dialogPaper: {
    height: 592,
    borderRadius: 12,
  },
  dialogHeader: {
    position: 'relative',
    flexShrink: 0,
  },
  dialogContent: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    overflow: 'hidden',
    padding: '8px 0 0',
  },
  closeButton: {
    position: 'absolute',
    top: 20,
    right: 16,
    width: 40,
    height: 40,
    padding: 8,
    borderRadius: 8,
    color: theme.palette.contrastPrimaryMainColor,
  },
  closeIcon: {
    display: 'block',
    width: 24,
    height: 24,
    flexShrink: 0,
    backgroundColor: 'currentColor',
    WebkitMaskSize: 'contain',
    maskSize: 'contain',
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskPosition: 'center',
    maskPosition: 'center',
  },
  fieldset: {
    width: `100%`,
    boxSizing: 'border-box',
    padding: 0,
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  tabHeadingWrapper: {
    flexShrink: 0,
    borderBottom: `1px solid rgba(0, 123, 255, 0.2)`,
    '& .MuiTabs-scroller': {
      padding: '0 24px',
    },
  },
  tab: {
    minWidth: 100,
  },
  tabContainer: {
    flex: 1,
    minHeight: 0,
    overflowX: 'hidden',
    overflowY: `auto`,
    '&::-webkit-scrollbar': {
      width: 12,
      height: 12,
      background: theme.palette.background.paper,
    },
    '&::-webkit-scrollbar-track': { backgroundColor: 'transparent' },
    '&::-webkit-scrollbar-thumb, &::-webkit-scrollbar-thumb:hover': {
      backgroundColor: 'transparent',
      border: '4px solid transparent',
      minHeight: 100,
      borderRadius: 8,
    },
    '&[data-scrolling="true"]::-webkit-scrollbar-thumb': {
      backgroundColor: '#b0b0b6',
      borderColor: theme.palette.background.paper,
    },
    '&::-webkit-scrollbar-thumb:hover, &[data-scrolling="true"]::-webkit-scrollbar-thumb:hover':
      {
        backgroundColor: '#85858b',
        borderColor: theme.palette.background.paper,
        borderWidth: 1,
        borderRightWidth: 2,
      },
    '&::-webkit-scrollbar-thumb:active, &[data-scrolling="true"]::-webkit-scrollbar-thumb:active':
      {
        backgroundColor: '#85858b',
        borderColor: theme.palette.background.paper,
        borderWidth: 1,
        borderRightWidth: 2,
      },
    '&::-webkit-scrollbar-corner': {
      background: theme.palette.background.paper,
    },
  },
  tabContent: {
    padding: '20px 24px 0 39px',
  },
  subtitleMarginFix: {
    marginTop: 10,
  },
  subtitle: {},
  fmSettingsStylesFix: {
    marginTop: 10,
  },
  subheading: {
    marginBottom: 5,
  },
  title: {
    flex: `0 0 auto`,
    margin: 0,
    padding: `24px 64px 8px 24px`,
  },
  switch: {
    height: 30,
    marginBottom: 7,
  },
  block: {
    marginBottom: 20,
  },
  onboardingPaper: {
    position: `relative`,
    padding: 10,
    marginTop: 4,
    backgroundColor: theme.palette.secondary.main,
  },
  onboardingPaperArrow: {
    fontWeight: `bold`,
    content: ' ',
    borderBottom: `11px solid ${theme.palette.secondary.main}`,
    borderLeft: '8px solid transparent',
    borderRight: '8px solid transparent',
    position: 'absolute',
    top: -10,
    left: 2,
  },
  onboardingPaperBody: {},
  onboardingPaperBodyItem: {
    color: '#ffffff',
    display: 'block',
    width: '100%',
    fontSize: 13,
    fontWeight: 500,
  },
});
