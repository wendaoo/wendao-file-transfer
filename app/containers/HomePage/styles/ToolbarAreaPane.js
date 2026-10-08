import styled, { keyframes } from 'styled-components';
import { mixins } from '../../../styles/js';
import { getCurrentThemePalette } from '../../App/styles';

export const styles = (theme) => {
  return {
    root: {
      position: 'relative',
      flexShrink: 0,
      ...mixins({ theme }).appDragEnable,
    },
    grow: {
      flexGrow: 1,
    },
    toolbarInnerWrapper: {
      display: 'flex',
      alignItems: 'center',
    },
    toolbar: {
      width: `auto`,
      height: 40,
      minHeight: 40,
    },
    lazyLoaderOverLay: {
      position: `absolute`,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: theme.palette.background.paper,
      zIndex: 9999,
    },
    appBar: { background: 'transparent' },
    navBtns: {
      paddingLeft: 4,
      '& button': {
        padding: 6,
        width: 40,
        height: 40,
        borderRadius: 8,
        backgroundColor: 'transparent',
        '&:hover': { backgroundColor: theme.palette.action.hover },
      },
    },
    noAppDrag: {
      ...mixins({ theme }).appDragDisable,
    },
    navBtnIcons: {
      height: 24,
      width: `24px !important`,
      color: theme.palette.contrastPrimaryMainColor,
      ...mixins({ theme }).noDrag,
      ...mixins({ theme }).noselect,
    },
    navBtnAsset: {
      display: 'block',
      flexShrink: 0,
      backgroundColor: 'currentColor',
      WebkitMaskSize: 'contain',
      WebkitMaskRepeat: 'no-repeat',
      WebkitMaskPosition: 'center',
    },
    navBtnImages: {
      height: 27,
      width: `27px !important`,
    },
    imageBtn: {
      padding: `10px !important`,
      background: '#fff',
      [`&:hover`]: {
        background: `rgba(255, 255, 255, 0.85) !important`,
      },
    },
    disabledNavBtns: {
      backgroundColor: 'transparent !important',
      opacity: 0.35,
    },
    invertedNavBtns: {
      [`&:hover`]: {
        filter: `invert(100)`,
      },
      [`&:not(:hover)`]: {
        filter: `invert(100)`,
        background: `#f9f9f952`,
      },
    },
    focussedFileExplorer: {
      width: '100%',
      height: 5,
      marginTop: -5,
      overflow: 'hidden',
      background: 'rgba(0, 176, 255, 0.22)',
    },
  };
};

const animateLazyLoaderOverLay = keyframes`
  0% {
    opacity: 1;
    position: absolute;
  }
  100% {
    opacity: 0;
    top: -9999px;
    left: -9999px;
    display: none;
    position: unset;
    z-index: -9999;
  }
`;

export const LazyLoaderOverlay = ({ appThemeMode }) => {
  const { background } = getCurrentThemePalette(appThemeMode);

  return styled.div`
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 9999;
    background-color: ${background.paper};
    animation: ${animateLazyLoaderOverLay} 0s 3s forwards;
  `;
};
