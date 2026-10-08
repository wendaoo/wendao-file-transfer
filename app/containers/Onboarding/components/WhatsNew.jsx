import React, { PureComponent } from 'react';
import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemIcon from '@material-ui/core/ListItemIcon';
import ListItemText from '@material-ui/core/ListItemText';
import SystemUpdate from '@material-ui/icons/SystemUpdate';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import NewReleasesIcon from '@material-ui/icons/NewReleases';
import { styles } from '../styles/WhatsNew';
import { APP_NAME, APP_VERSION } from '../../../constants/meta';
import { isKalamModeSupported } from '../../../helpers/binaries';
import { MTP_MODE } from '../../../enums';

class WhatsNew extends PureComponent {
  render() {
    const isKalamModeDisabled = !isKalamModeSupported();
    const { classes: styles, hideTitle } = this.props;

    return (
      <div className={styles.root}>
        {hideTitle ? null : (
          <Typography
            variant="body1"
            className={styles.title}
            color="secondary"
          >
            What&apos;s new in {APP_NAME}-{APP_VERSION}?
          </Typography>
        )}

        <List>
          <ListItem>
            <ListItemIcon>
              <CheckCircleIcon htmlColor="#4caf50" />
            </ListItemIcon>
            <ListItemText
              primary="Added support for macOS 27 Golden Gate"
              secondary="Fixes a crash on launch on macOS 27 Golden Gate"
            />
          </ListItem>

          <ListItem>
            <ListItemIcon>
              <NewReleasesIcon htmlColor="#ff9800" />
            </ListItemIcon>
            <ListItemText
              primary={`The next generation of ${APP_NAME} is on its way`}
              secondary="A major upgrade with new features, and big improvements to overall stability and performance is in the works and coming soon. Stay tuned, thanks for all the support!"
            />
          </ListItem>

          {isKalamModeDisabled && (
            <ListItem>
              <ListItemIcon>
                <SystemUpdate htmlColor="#fa4d0a" />
              </ListItemIcon>
              <ListItemText
                primary={`We have now officially retired the support for '${MTP_MODE.kalam}' Kernel on macOS 10.13 (OS X El High Sierra) and lower`}
                secondary={`However the '${MTP_MODE.legacy}' MTP mode will continue working on these outdated machines`}
              />
            </ListItem>
          )}
        </List>
      </div>
    );
  }
}

export default withStyles(styles)(WhatsNew);
