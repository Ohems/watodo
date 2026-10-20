import CssBaseline from '@mui/material/CssBaseline';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { Provider } from 'react-redux';
import { Route, Routes } from 'react-router-dom';
import NavBar from './components/NavBar/NavBar.js';
import ErrorPage from './pages/ErrorPage/ErrorPage.js';
import Home from './pages/Home/Home.js';
import NoOrganizationPage from './pages/NoOrganizationPage/NoOrganizationPage.js';
import UserList from './pages/UserList/UserList.js';
import UserProfile from './pages/UserProfile/UserProfile.js';
import { store } from './store/index.js';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#1976d2' },
    secondary: { main: '#dc004e' },
  },
});

function App() {
  return (
    <Provider store={store}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <NavBar />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/users" element={<UserList />} />
          <Route path="/users/:userId" element={<UserProfile />} />
          <Route path="/organization" element={<NoOrganizationPage />} />
          <Route path="*" element={<ErrorPage />} />
        </Routes>
      </ThemeProvider>
    </Provider>
  );
}

export default App;
