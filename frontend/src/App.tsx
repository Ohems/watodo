import { Box, Loader, MantineProvider } from '@mantine/core';

import { useEffect } from 'react';
import { Provider } from 'react-redux';
import { Route, Routes } from 'react-router-dom';
import NavBar from './components/NavBar/NavBar.js';
import { useAppDispatch, useAppSelector } from './hooks/redux.js';
import AccountPage from './pages/Account/Account.js';
import ErrorPage from './pages/ErrorPage/ErrorPage.js';
import CalendarPage from './pages/Events/CalendarPage.js';
import EventConfigPage from './pages/Events/EventConfigPage.js';
import EventManagementPage from './pages/Events/EventManagementPage.js';
import Home from './pages/Home/Home.js';
import LoginPage from './pages/Login/LoginPage.js';
import JobConfigPage from './pages/Organization/JobConfigPage.js';
import OrgGeneralPage from './pages/Organization/OrgGeneralPage.js';
import OrgJobsPage from './pages/Organization/OrgJobsPage.js';
import OrgSitesPage from './pages/Organization/OrgSitesPage.js';
import OrgUserProfilePage from './pages/Organization/OrgUserProfilePage.js';
import OrgUsersPage from './pages/Organization/OrgUsersPage.js';
import RoomConfigPage from './pages/Organization/RoomConfigPage.js';
import SiteConfigPage from './pages/Organization/SiteConfigPage.js';
import TeamManagementPage from './pages/Teams/TeamManagementPage.js';
import TeamsPage from './pages/Teams/TeamsPage.js';
import UserList from './pages/UserList/UserList.js';
import UserProfile from './pages/UserProfile/UserProfile.js';
import { store } from './store/index.js';
import { fetchMyOrganizations } from './store/organization-slice.js';
import { fetchCurrentUser } from './store/user-slice.js';

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
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Loader />
      </Box>
    );
  }

  return (
    <>
      <NavBar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/events/calendar" element={<CalendarPage />} />
        <Route path="/events/management" element={<EventManagementPage />} />
        <Route path="/events/:eventId" element={<EventConfigPage />} />
        <Route path="/teams" element={<TeamsPage />} />
        <Route path="/teams/:teamId" element={<TeamManagementPage />} />
        <Route path="/organization/general" element={<OrgGeneralPage />} />
        <Route path="/organization/sites" element={<OrgSitesPage />} />
        <Route path="/organization/sites/:siteId" element={<SiteConfigPage />} />
        <Route path="/organization/sites/:siteId/rooms/:roomId" element={<RoomConfigPage />} />
        <Route path="/organization/jobs" element={<OrgJobsPage />} />
        <Route path="/organization/jobs/:jobId" element={<JobConfigPage />} />
        <Route path="/organization/users" element={<OrgUsersPage />} />
        <Route path="/organization/users/:userId" element={<OrgUserProfilePage />} />
        <Route path="/users" element={<UserList />} />
        <Route path="/users/:userId" element={<UserProfile />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/organization" element={<OrgGeneralPage />} />
        <Route path="*" element={<ErrorPage />} />
      </Routes>
    </>
  );
}

function App() {
  return (
    <Provider store={store}>
      <MantineProvider>
        <AppContent />
      </MantineProvider>
    </Provider>
  );
}

export default App;
