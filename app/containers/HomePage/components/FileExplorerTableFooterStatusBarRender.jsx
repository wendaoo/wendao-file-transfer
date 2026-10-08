import React from 'react';
import { withStyles } from '@material-ui/core/styles';
import { styles } from '../styles/FileExplorerTableFooterStatusBarRender';

function FileExplorerTableFooterStatusBarRender({
  classes,
  directoryLists,
  fileTransferClipboard,
}) {
  const total = directoryLists.nodes.length;
  const selected = directoryLists.queue.selected.length;
  const clipboard = fileTransferClipboard.queue.length;

  return (
    <div className={classes.root}>
      <span>
        {total} 个项目{selected > 0 ? ` · 已选择 ${selected} 项` : ''}
      </span>
      {clipboard > 0 && <span>待传输 {clipboard} 项</span>}
    </div>
  );
}

export default withStyles(styles)(FileExplorerTableFooterStatusBarRender);
