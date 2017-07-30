import 'react-select/dist/react-select.css';

import React from 'react';
import { Switch, Route, withRouter } from 'react-router-dom';
import Select from 'react-select';

import Home from './Home';

import ToolbarButton from '../components/ToolbarButton';

class App extends React.Component {
  render() {
    const routes = [
      { path: '/home', component: Home },
    //  { path: '/editor', component: Editor, icon: 'mdi-border-color' },
    //  { path: '/debugger', component: Debugger, icon: 'mdi-console' },
    ];

    const languages = [
      { value: 'EN', label: 'English' },
      { value: 'FI', label: 'Suomi' },
    ];

    const openCalendar = () => {
      this.props.history.push('/home');
    };

    const openContacts = () => {
      this.props.history.push('/contacts');
    };

    return (
      <div className="app">
        <div className="app-header">
          <h1>Watodo</h1>

          <div className="app-main-actions">
            <div className="app-language-select">
              <Select
                name="form-field-name"
                value="EN"
                options={languages}
                clearable={false}
              />
            </div>
            <p className="app-login">Login</p>
          </div>
        </div>

        <div className="app-toolbar">
          <ToolbarButton expand onClick={openCalendar}>
            Calendar
          </ToolbarButton>
          <ToolbarButton expand onClick={openContacts}>
            Contacts
          </ToolbarButton>
        </div>

        <div className="app-content">
          <Switch>
            {routes.map(route => (
              <Route
                exact
                path={route.path}
                component={route.component}
              />
            ))}
          </Switch>
        </div>
      </div>
    );
  }
}

export default withRouter(App);
