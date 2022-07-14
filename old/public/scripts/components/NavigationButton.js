import React from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import { browserHistory } from 'react-router';

class NavigationButton extends React.Component {
  render() {
    const className = classNames(
      this.props.secondary ? 'secondary-button' : 'navigation-button',
      { 'selected-button': this.props.selected }
    );

    const onClick = () => {
      if (this.props.route) {
        browserHistory.push(this.props.route);
      } else if (this.props.href) {
        const win = window.open(this.props.href, '_blank');
        win.focus();
      }
    };

    return (
      <div className={className} onClick={onClick}>{this.props.children}</div>
    );
  }
}

NavigationButton.propTypes = {
  match: PropTypes.object.isRequired,
  location: PropTypes.object.isRequired,
  history: PropTypes.object.isRequired,

  path: PropTypes.string.isRequired,
  children: PropTypes.object.isRequired,
};

export default NavigationButton;
