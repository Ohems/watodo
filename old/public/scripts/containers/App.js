import 'react-select/dist/react-select.css';

import React from 'react';
import { Switch, Route, withRouter } from 'react-router-dom';
import Select from 'react-select';

import Home from './Home';
import UserList from './UserList';
import UserProfile from './UserProfile';

import ToolbarButton from '../components/ToolbarButton';

class App extends React.Component {
  render() {
    const routes = [
      { path: '/home', component: Home },
      { path: '/users', component: UserList },
      { path: '/users/:userId', component: UserProfile },
    ];

    const languages = [
      { value: 'EN', label: 'English' },
      { value: 'FI', label: 'Suomi' },
    ];

    const openRoute = route => () => {
      this.props.history.push(route);
    };

    return (
      <div className="app">
        <div className="app-header">
          <img className="app-logo" src="/images/logo_white.svg" alt="Watodo logo" />

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
          <ToolbarButton expand onClick={openRoute('/home')}>
            Calendar
          </ToolbarButton>
          <ToolbarButton expand onClick={openRoute('/users')}>
            Contacts
          </ToolbarButton>
        </div>

        <div className="app-content">
          <Switch>
            {routes.map((route, i) => (
              <Route
                exact
                key={i}
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
