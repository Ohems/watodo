import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import CssBaseline from '@mui/material/CssBaseline';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { useEffect } from 'react';
import { Provider } from 'react-redux';
import { Route, Routes } from 'react-router-dom';
import NavBar from './components/NavBar/NavBar.js';
import { useAppDispatch, useAppSelector } from './hooks/redux.js';
import AccountPage from './pages/Account/Account.js';
import ErrorPage from './pages/ErrorPage/ErrorPage.js';
import Events from './pages/Events/Events.js';
import Home from './pages/Home/Home.js';
import LoginPage from './pages/Login/LoginPage.js';
import OrganizationPage from './pages/Organization/Organization.js';
import UserList from './pages/UserList/UserList.js';
import UserProfile from './pages/UserProfile/UserProfile.js';
import { store } from './store/index.js';
import { fetchMyOrganizations } from './store/organization-slice.js';
import { fetchCurrentUser } from './store/user-slice.js';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#1976d2' },
    secondary: { main: '#dc004e' },
  },
});

function AppContent() {
  const dispatch = useAppDispatch();
  const authStatus = useAppSelector(state => state.user.authStatus);

  useEffect(() => {
    dispatch(fetchCurrentUser());
  }, [dispatch]);

  useEffect(() => {
    if (authStatus === 'authenticated') {
      dispatch(fetchMyOrganizations());
    }
  }, [dispatch, authStatus]);

  if (authStatus === 'unauthenticated') {
    return <LoginPage />;
  }

  if (authStatus !== 'authenticated') {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <>
      <NavBar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/events" element={<Events />} />
        <Route path="/users" element={<UserList />} />
        <Route path="/users/:userId" element={<UserProfile />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/organization" element={<OrganizationPage />} />
        <Route path="*" element={<ErrorPage />} />
      </Routes>
    </>
  );
}

function App() {
  return (
    <Provider store={store}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <AppContent />
      </ThemeProvider>
    </Provider>
  );
}

export default App;
