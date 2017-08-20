import React from 'react'; // eslint-disable-line no-unused-vars
import { render } from 'react-dom';
import { BrowserRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { createStore, applyMiddleware } from 'redux';
import { composeWithDevTools } from 'redux-devtools-extension/developmentOnly';
import thunkMiddleware from 'redux-thunk';

import reducers from './reducers';
import App from './containers/App';

const store = createStore(reducers, composeWithDevTools(
  applyMiddleware(
    thunkMiddleware,
  )
));

render((
  <BrowserRouter>
    <Provider store={store}>
      <App />
    </Provider>
  </BrowserRouter>
), document.getElementById('root'));

