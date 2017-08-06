import React from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';

class ToolbarButton extends React.Component {
  render() {
    const className = classNames(
      'toolbar-button',
      { 'toolbar-button-expand': this.props.expand },
      { 'toolbar-button-selected': this.props.selected }
    );

    return (
      <div className={className} onClick={this.props.onClick}>
        {this.props.children}
      </div>
    );
  }
}

ToolbarButton.propTypes = {
  expand: PropTypes.bool,
  onClick: PropTypes.func.isRequired,
  children: PropTypes.any.isRequired,
};

export default ToolbarButton;
