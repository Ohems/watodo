import React from 'react';
import Select from 'react-select';

class EditField extends React.Component {
  constructor(props) {
    super(props);
    this.state = { value: props.value };

    this.handleChange = this.handleChange.bind(this);
  }

  handleChange(event) {
    this.setState({ value: event.target.value });
  }

  render() {
    let component;

    if (this.props.editing) {
      if (this.props.options) {
        component = (
          <Select
            {...this.props}
            value={this.state.value}
          />
        );
      } else if (this.props.loadOptions) {
        component = (
          <Select.Async
            {...this.props}
            value={this.state.value}
          />
        );
      } else {
        component = (
          <input
            type="text"
            value={this.state.value}
            onChange={this.handleChange}
          />
        )
      }
    } else {
      component = (
        <p className="edit-field-value">
          {this.props.value}
        </p>
      );
    }

    return (
      <div className="edit-field">
        {component}
      </div>
    );
  }
}

export default EditField;
