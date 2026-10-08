import React, { PureComponent } from 'react';
import electronIs from 'electron-is';
import Tabs from '@material-ui/core/Tabs';
import Tab from '@material-ui/core/Tab';
import Typography from '@material-ui/core/Typography';
import IconButton from '@material-ui/core/IconButton';
import RadioGroup from '@material-ui/core/RadioGroup';
import Radio from '@material-ui/core/Radio';
import Dialog from '@material-ui/core/Dialog';
import DialogContent from '@material-ui/core/DialogContent';
import Paper from '@material-ui/core/Paper';
import Switch from '@material-ui/core/Switch';
import FormControl from '@material-ui/core/FormControl';
import FormGroup from '@material-ui/core/FormGroup';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import SettingsDialogTabContainer from './SettingsDialogTabContainer';
import {
  DEVICE_TYPE,
  FILE_EXPLORER_VIEW_TYPE,
  APP_THEME_MODE_TYPE,
  MTP_MODE,
  FILE_TRANSFER_DIRECTION,
} from '../../../enums';
import { isPrereleaseVersion } from '../../../utils/funcs';
import { isKalamModeSupported } from '../../../helpers/binaries';
import closeIcon from '../../../../assets/取消 cancel.svg';

const isMas = electronIs.mas();

export default class SettingsDialog extends PureComponent {
  constructor(props) {
    super(props);

    this.state = {
      tabIndex: 0,
    };

    this.isMasHidePosition = 1;
  }

  _handleTabChange = (event, index) => {
    this.setState({
      tabIndex: index,
    });
  };

  shoudThisTabHeadRender = (position) => {
    return !(isMas && this.isMasHidePosition === position);
  };

  tabBodyRenderTabIndex = (position) => {
    if (isMas && this.isMasHidePosition === position) {
      return null;
    }

    if (isMas && position > this.isMasHidePosition) {
      return position - 1 < 1 ? 0 : position - 1;
    }

    return position;
  };

  render() {
    const {
      open,
      freshInstall,
      hideHiddenFiles,
      fileExplorerListingType,
      appThemeMode,
      styles,
      enableAutoUpdateCheck,
      enableBackgroundAutoUpdate,
      enablePrereleaseUpdates,
      enableStatusBar,
      showDirectoriesFirst,
      mtpMode,
      filesPreprocessingBeforeTransfer,
      onHiddenFilesChange,
      onFileExplorerListingType,
      onDialogBoxCloseBtnClick,
      onAutoUpdateCheckChange,
      onEnableBackgroundAutoUpdateChange,
      onPrereleaseUpdatesChange,
      onStatusBarChange,
      onAppThemeModeChange,
      onShowDirectoriesFirstChange,
      onMtpModeChange,
      onFilesPreprocessingBeforeTransferChange,
      onEnableUsbHotplug,
      enableUsbHotplug,
    } = this.props;

    const { tabIndex } = this.state;

    const hideHiddenFilesLocal = hideHiddenFiles[DEVICE_TYPE.local];
    const hideHiddenFilesMtp = hideHiddenFiles[DEVICE_TYPE.mtp];

    const fileExplorerListingTypeLocalGrid =
      fileExplorerListingType[DEVICE_TYPE.local] ===
      FILE_EXPLORER_VIEW_TYPE.grid;
    const fileExplorerListingTypeMtpGrid =
      fileExplorerListingType[DEVICE_TYPE.mtp] === FILE_EXPLORER_VIEW_TYPE.grid;

    const showMtpModeSelection = isKalamModeSupported();

    return (
      <Dialog
        open={open}
        fullWidth
        maxWidth="sm"
        PaperProps={{ className: styles.dialogPaper }}
        aria-labelledby="settings-dialogbox"
        disableEscapeKeyDown={false}
        onEscapeKeyDown={() =>
          onDialogBoxCloseBtnClick({
            confirm: false,
          })
        }
      >
        <div className={styles.dialogHeader}>
          <Typography
            id="settings-dialogbox"
            variant="h5"
            className={styles.title}
          >
            设置
          </Typography>
          <IconButton
            className={styles.closeButton}
            aria-label="关闭设置"
            title="关闭设置"
            onClick={() => onDialogBoxCloseBtnClick({ confirm: false })}
          >
            <span
              className={styles.closeIcon}
              style={{
                WebkitMaskImage: `url("${closeIcon}")`,
                maskImage: `url("${closeIcon}")`,
              }}
              aria-hidden="true"
            />
          </IconButton>
        </div>
        <DialogContent className={styles.dialogContent}>
          <Tabs
            className={styles.tabHeadingWrapper}
            value={tabIndex}
            onChange={this._handleTabChange}
            indicatorColor="secondary"
            textColor="secondary"
            variant="scrollable"
            scrollButtons="auto"
          >
            {this.shoudThisTabHeadRender(0) && (
              <Tab label="通用" className={styles.tab} />
            )}
            {this.shoudThisTabHeadRender(1) && (
              <Tab label="文件管理" className={styles.tab} />
            )}
            {this.shoudThisTabHeadRender(2) && (
              <Tab label="更新" className={styles.tab} />
            )}
          </Tabs>

          {/* ----- General Tab ----- */}
          <FormControl component="fieldset" className={styles.fieldset}>
            {tabIndex === this.tabBodyRenderTabIndex(0) && (
              <SettingsDialogTabContainer className={styles.tabContainer}>
                <div className={styles.tabContent}>
                  <FormGroup>
                    <Typography variant="subtitle2" className={styles.subtitle}>
                      外观主题
                    </Typography>
                    <RadioGroup
                      aria-label="外观主题"
                      name="app-theme-mode"
                      value={appThemeMode}
                      onChange={onAppThemeModeChange}
                    >
                      <FormControlLabel
                        value={APP_THEME_MODE_TYPE.light}
                        control={<Radio />}
                        label="浅色"
                      />
                      <FormControlLabel
                        value={APP_THEME_MODE_TYPE.dark}
                        control={<Radio />}
                        label="深色"
                      />
                      <FormControlLabel
                        value={APP_THEME_MODE_TYPE.auto}
                        control={<Radio />}
                        label="跟随系统"
                      />
                    </RadioGroup>

                    {showMtpModeSelection && (
                      <>
                        <Typography
                          variant="subtitle2"
                          className={`${styles.subtitle}  ${styles.fmSettingsStylesFix}`}
                        >
                          MTP 传输模式
                        </Typography>
                        <RadioGroup
                          aria-label="MTP 传输模式"
                          name="mtp-mode"
                          value={mtpMode}
                          onChange={(e, value) =>
                            onMtpModeChange(e, value, DEVICE_TYPE.mtp)
                          }
                        >
                          <FormControlLabel
                            value={MTP_MODE.kalam}
                            control={<Radio />}
                            label="Kalam 模式"
                          />
                          <FormControlLabel
                            value={MTP_MODE.legacy}
                            control={<Radio />}
                            label="传统模式"
                          />
                        </RadioGroup>
                      </>
                    )}

                    <Typography
                      variant="subtitle2"
                      className={`${styles.subtitle} ${styles.fmSettingsStylesFix}`}
                    >
                      自动检测设备（USB 热插拔）
                    </Typography>
                    <FormControlLabel
                      className={styles.switch}
                      control={
                        <Switch
                          checked={enableUsbHotplug}
                          onChange={(e) =>
                            onEnableUsbHotplug(e, !enableUsbHotplug)
                          }
                        />
                      }
                      label={enableUsbHotplug ? `已开启` : `已关闭`}
                    />
                  </FormGroup>
                </div>
              </SettingsDialogTabContainer>
            )}

            {/* ----- File Manager Tab ----- */}
            {tabIndex === this.tabBodyRenderTabIndex(1) && (
              <SettingsDialogTabContainer className={styles.tabContainer}>
                <div className={styles.tabContent}>
                  <FormGroup>
                    <Typography variant="subtitle2" className={styles.subtitle}>
                      显示隐藏文件
                    </Typography>
                    <FormControlLabel
                      className={styles.switch}
                      control={
                        <Switch
                          checked={!hideHiddenFilesLocal}
                          onChange={(e) =>
                            onHiddenFilesChange(
                              e,
                              !hideHiddenFilesLocal,
                              DEVICE_TYPE.local
                            )
                          }
                        />
                      }
                      label="本机"
                    />
                    <FormControlLabel
                      className={styles.switch}
                      control={
                        <Switch
                          checked={!hideHiddenFilesMtp}
                          onChange={(e) =>
                            onHiddenFilesChange(
                              e,
                              !hideHiddenFilesMtp,
                              DEVICE_TYPE.mtp
                            )
                          }
                        />
                      }
                      label="设备"
                    />

                    <Typography
                      variant="subtitle2"
                      className={`${styles.subtitle} ${styles.fmSettingsStylesFix}`}
                    >
                      使用宫格视图
                    </Typography>
                    <FormControlLabel
                      className={styles.switch}
                      control={
                        <Switch
                          checked={fileExplorerListingTypeLocalGrid}
                          onChange={(e) =>
                            onFileExplorerListingType(
                              e,
                              fileExplorerListingTypeLocalGrid
                                ? FILE_EXPLORER_VIEW_TYPE.list
                                : FILE_EXPLORER_VIEW_TYPE.grid,
                              DEVICE_TYPE.local
                            )
                          }
                        />
                      }
                      label="本机"
                    />
                    <FormControlLabel
                      className={styles.switch}
                      control={
                        <Switch
                          checked={fileExplorerListingTypeMtpGrid}
                          onChange={(e) =>
                            onFileExplorerListingType(
                              e,
                              fileExplorerListingTypeMtpGrid
                                ? FILE_EXPLORER_VIEW_TYPE.list
                                : FILE_EXPLORER_VIEW_TYPE.grid,
                              DEVICE_TYPE.mtp
                            )
                          }
                        />
                      }
                      label="设备"
                    />

                    <Typography
                      variant="subtitle2"
                      className={`${styles.subtitle} ${styles.fmSettingsStylesFix}`}
                    >
                      在文件传输时显示总体进度
                    </Typography>
                    <FormControlLabel
                      className={styles.switch}
                      control={
                        <Switch
                          checked={
                            filesPreprocessingBeforeTransfer[
                              FILE_TRANSFER_DIRECTION.download
                            ]
                          }
                          onChange={(e) =>
                            onFilesPreprocessingBeforeTransferChange(
                              e,
                              !filesPreprocessingBeforeTransfer[
                                FILE_TRANSFER_DIRECTION.download
                              ],
                              FILE_TRANSFER_DIRECTION.download
                            )
                          }
                        />
                      }
                      label="下载到本机"
                    />
                    <FormControlLabel
                      className={styles.switch}
                      control={
                        <Switch
                          checked={
                            filesPreprocessingBeforeTransfer[
                              FILE_TRANSFER_DIRECTION.upload
                            ]
                          }
                          onChange={(e) =>
                            onFilesPreprocessingBeforeTransferChange(
                              e,
                              !filesPreprocessingBeforeTransfer[
                                FILE_TRANSFER_DIRECTION.upload
                              ],
                              FILE_TRANSFER_DIRECTION.upload
                            )
                          }
                        />
                      }
                      label="上传到设备"
                    />

                    {freshInstall ? (
                      <Paper
                        className={`${styles.onboardingPaper}`}
                        elevation={0}
                      >
                        <Typography
                          component="p"
                          className={`${styles.onboardingPaperBody}`}
                        >
                          <span className={`${styles.onboardingPaperBodyItem}`}>
                            &#9679;&nbsp;使用开关开启或关闭对应选项。
                          </span>
                          <span className={`${styles.onboardingPaperBodyItem}`}>
                            &#9679;&nbsp;向下滚动查看更多设置。
                          </span>
                        </Typography>
                      </Paper>
                    ) : null}

                    <Typography variant="caption">
                      说明：显示总体传输进度需要先统计文件信息。根据待复制文件的数量，可能需要几秒到几分钟。
                    </Typography>

                    <Typography
                      variant="subtitle2"
                      className={`${styles.subtitle} ${styles.fmSettingsStylesFix}`}
                    >
                      文件夹优先显示
                    </Typography>
                    <FormControlLabel
                      className={styles.switch}
                      control={
                        <Switch
                          checked={showDirectoriesFirst}
                          onChange={(e) =>
                            onShowDirectoriesFirstChange(
                              e,
                              !showDirectoriesFirst
                            )
                          }
                        />
                      }
                      label={showDirectoriesFirst ? `已开启` : `已关闭`}
                    />

                    <Typography
                      variant="subtitle2"
                      className={`${styles.subtitle} ${styles.fmSettingsStylesFix}`}
                    >
                      显示状态栏
                    </Typography>
                    <FormControlLabel
                      className={styles.switch}
                      control={
                        <Switch
                          checked={enableStatusBar}
                          onChange={(e) =>
                            onStatusBarChange(e, !enableStatusBar)
                          }
                        />
                      }
                      label={enableStatusBar ? `已开启` : `已关闭`}
                    />

                    <Typography variant="caption">
                      左侧显示设备概览，右侧浏览设备文件。可从 Finder 拖入文件。
                    </Typography>
                  </FormGroup>
                </div>
              </SettingsDialogTabContainer>
            )}

            {/* ----- Updates Tab ----- */}

            {tabIndex === this.tabBodyRenderTabIndex(2) && (
              <SettingsDialogTabContainer className={styles.tabContainer}>
                <div className={styles.tabContent}>
                  <FormGroup>
                    <Typography variant="subtitle2" className={styles.subtitle}>
                      自动检查更新
                    </Typography>

                    <FormControlLabel
                      className={styles.switch}
                      control={
                        <Switch
                          checked={enableAutoUpdateCheck}
                          onChange={(e) =>
                            onAutoUpdateCheckChange(e, !enableAutoUpdateCheck)
                          }
                        />
                      }
                      label={enableAutoUpdateCheck ? `已开启` : `已关闭`}
                    />
                  </FormGroup>

                  <FormGroup>
                    <Typography variant="subtitle2" className={styles.subtitle}>
                      有新版本时自动下载更新（推荐）
                    </Typography>

                    <FormControlLabel
                      className={styles.switch}
                      control={
                        <Switch
                          checked={enableBackgroundAutoUpdate}
                          disabled={!enableAutoUpdateCheck}
                          onChange={(e) =>
                            onEnableBackgroundAutoUpdateChange(
                              e,
                              !enableBackgroundAutoUpdate
                            )
                          }
                        />
                      }
                      label={enableBackgroundAutoUpdate ? `已开启` : `已关闭`}
                    />
                  </FormGroup>

                  <FormGroup>
                    <Typography
                      variant="subtitle2"
                      className={`${styles.subtitle} ${styles.subtitleMarginFix}`}
                    >
                      接收测试版更新
                    </Typography>

                    <FormControlLabel
                      className={styles.switch}
                      control={
                        <Switch
                          checked={enablePrereleaseUpdates}
                          disabled={isPrereleaseVersion()}
                          onChange={(e) =>
                            onPrereleaseUpdatesChange(
                              e,
                              !enablePrereleaseUpdates
                            )
                          }
                        />
                      }
                      label={enablePrereleaseUpdates ? `已开启` : `已关闭`}
                    />
                  </FormGroup>
                  <Typography variant="caption">
                    提前体验即将推出的新功能，但测试版可能不稳定或发生崩溃。
                  </Typography>
                </div>
              </SettingsDialogTabContainer>
            )}
          </FormControl>
        </DialogContent>
      </Dialog>
    );
  }
}
