import { mixins } from '../../../styles/js';

export const styles = (theme) => {
  return {
    root: {
      width: `100%`,
      height: 14,
      textAlign: 'center',
      ...mixins({ theme }).appDragEnable,
      ...mixins({ theme }).center,
    },
  };
};
