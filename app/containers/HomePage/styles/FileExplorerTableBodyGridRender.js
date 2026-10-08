import { mixins } from '../../../styles/js';

export const styles = (theme) => ({
  wrapper: {},
  itemWrapper: {
    float: `left`,
    width: 112,
    height: 112,
    flexShrink: 0,
    boxSizing: 'border-box',
    borderRadius: 8,
  },
  itemCheckBox: {
    display: `none`,
  },
  thumbnail: { width: 80, height: 48, objectFit: 'contain', borderRadius: 4 },
  fileTypeIcon: {
    width: 'auto',
    height: 48,
  },
  fileTypeIconWrapper: {
    ...mixins({ theme }).center,
    position: 'relative',
    paddingTop: 10,
    paddingBottom: 10,
    textAlign: 'center',
  },
  itemSelected: {
    backgroundColor: 'rgba(41, 121, 255, 0.15) !important',
  },
  itemFileName: {
    fontSize: 12,
    wordBreak: `break-all`,
    textAlign: `center`,
  },
  itemFileNameWrapper: {
    marginLeft: 12,
    marginRight: 12,
    marginTop: -8,
    textAlign: `center`,
  },
});
