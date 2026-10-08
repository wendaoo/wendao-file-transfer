import React, { PureComponent } from 'react';

export default class SettingsDialogTabContainer extends PureComponent {
  constructor(props) {
    super(props);
    this.state = { scrolling: false };
    this.scrollTimer = null;
  }

  componentWillUnmount() {
    clearTimeout(this.scrollTimer);
  }

  handleScroll = () => {
    const { scrolling } = this.state;

    if (!scrolling) this.setState({ scrolling: true });
    clearTimeout(this.scrollTimer);
    this.scrollTimer = setTimeout(() => {
      this.setState({ scrolling: false });
    }, 900);
  };

  render() {
    const { children, className } = this.props;
    const { scrolling } = this.state;

    return (
      <div
        className={className}
        data-scrolling={scrolling}
        onScroll={this.handleScroll}
      >
        {children}
      </div>
    );
  }
}
