import React, { PureComponent, Fragment } from 'react';
import { withStyles } from '@material-ui/core/styles';
import classNames from 'classnames';
import Paper from '@material-ui/core/Paper';
import KeyboardArrowRightIcon from '@material-ui/icons/KeyboardArrowRight';
import Tooltip from '@material-ui/core/Tooltip';
import { quickHash } from '../../utils/funcs';
import { styles } from './styles';
import { sanitizePath } from '../../utils/files';
import { analyticsService } from '../../services/analytics';
import { EVENT_TYPE } from '../../enums/events';

class Breadcrumb extends PureComponent {
  _handleClickPath = (enabled, value, event) => {
    const { onBreadcrumbPathClick, deviceType } = this.props;

    event.preventDefault();

    if (!enabled) {
      return null;
    }

    onBreadcrumbPathClick({ path: value });

    const deviceTypeUpperCase = deviceType.toUpperCase();

    analyticsService.sendEvent(
      EVENT_TYPE[`${deviceTypeUpperCase}_BREADCRUMB_PATH_TAP`],
      {}
    );
  };

  tokenizeCurrentBrowsePath(currentBrowsePath) {
    const sanitizedCurrentBrowsePath = sanitizePath(currentBrowsePath);
    const _currentBrowsePath = [];
    let _bold = false;
    let _enabled = true;
    const currentBrowsePathBroken =
      sanitizedCurrentBrowsePath === '/'
        ? ['']
        : sanitizedCurrentBrowsePath.split('/');
    const currentBrowsePathBrokenLength = currentBrowsePathBroken.length;

    currentBrowsePathBroken.map((a, index) => {
      const label = a;

      if (index === currentBrowsePathBrokenLength - 1) {
        _bold = true;
        _enabled = false;
      }

      if (a === '' && index === 0) {
        _currentBrowsePath.push({
          label: 'Root',
          path: '/',
          enabled: _enabled,
          bold: _bold,
        });

        return null;
      }

      return _currentBrowsePath.push({
        label,
        path: `${currentBrowsePathBroken.slice(0, index + 1).join('/')}`,
        enabled: _enabled,
        bold: _bold,
      });
    });

    return _currentBrowsePath;
  }

  BreadcrumbCellRender(items) {
    const { classes: styles, pathLabels = {} } = this.props;

    return items.map(({ label, path, enabled, bold }, index) => (
      <Fragment key={quickHash(path)}>
        {index > 0 && (
          <span>
            <KeyboardArrowRightIcon className={styles.breadcrumbSeperator} />
          </span>
        )}
        <li className={styles.breadcrumbLi}>
          <Tooltip title={pathLabels[path] || label}>
            <a
              className={classNames(styles.breadcrumbLiA, { bold })}
              onClick={(event) => this._handleClickPath(enabled, path, event)}
            >
              {pathLabels[path] || label}
            </a>
          </Tooltip>
        </li>
      </Fragment>
    ));
  }

  render() {
    const { classes: styles, currentBrowsePath } = this.props;

    return (
      <div className={styles.root}>
        <div className={styles.rootBreadcrumbs}>
          <Paper elevation={0}>
            <ul className={styles.breadcrumb}>
              {this.BreadcrumbCellRender(
                this.tokenizeCurrentBrowsePath(currentBrowsePath)
              )}
            </ul>
          </Paper>
        </div>
      </div>
    );
  }
}

export default withStyles(styles)(Breadcrumb);
