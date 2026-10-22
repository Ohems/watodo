import MenuIcon from '@mui/icons-material/Menu';
import AppBar from '@mui/material/AppBar';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Toolbar from '@mui/material/Toolbar';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../hooks/redux.js';
import { logout } from '../../store/user-slice.js';
import OrganizationSelector from '../OrganizationSelector/OrganizationSelector.js';

function NavBar() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const currentUser = useAppSelector(state => state.user.currentUser);
  const [anchorElNav, setAnchorElNav] = useState<null | HTMLElement>(null);
  const [anchorElUser, setAnchorElUser] = useState<null | HTMLElement>(null);

  const pages = [
    { label: t('nav.calendar'), path: '/' },
    { label: t('nav.contacts'), path: '/users' },
    { label: t('nav.events'), path: '/events' },
    { label: t('nav.templates'), path: '/templates' },
    { label: t('nav.organization'), path: '/organization' },
  ];
  const settings = [
    { key: 'profile', label: t('nav.profile') },
    { key: 'account', label: t('nav.account') },
    { key: 'logout', label: t('nav.logout') },
  ];

  const handleSettingClick = (setting: string) => {
    setAnchorElUser(null);
    if (setting === 'logout') {
      dispatch(logout());
    } else if (setting === 'account') {
      navigate('/account');
    }
  };

  return (
    <AppBar position="static">
      <Container maxWidth="xl">
        <Toolbar disableGutters>
          <Box sx={{ mr: 1, display: { xs: 'none', md: 'block' } }}>
            <RouterLink to="/">
              <Box
                component="img"
                src="/logo_white.svg"
                alt="WATODO"
                sx={{ height: 36, display: 'block' }}
              />
            </RouterLink>
          </Box>

          <Box sx={{ flexGrow: 1, display: { xs: 'flex', md: 'none' } }}>
            <IconButton
              size="large"
              aria-label={t('nav.navigationMenu')}
              aria-controls="menu-appbar"
              aria-haspopup="true"
              onClick={e => setAnchorElNav(e.currentTarget)}
              color="inherit"
            >
              <MenuIcon />
            </IconButton>
            <Menu
              id="menu-appbar"
              anchorEl={anchorElNav}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
              keepMounted
              transformOrigin={{ vertical: 'top', horizontal: 'left' }}
              open={Boolean(anchorElNav)}
              onClose={() => setAnchorElNav(null)}
              sx={{ display: { xs: 'block', md: 'none' } }}
            >
              <Box sx={{ px: 2, py: 1, borderBottom: 1, borderColor: 'divider' }}>
                <OrganizationSelector />
              </Box>
              {pages.map(page => (
                <MenuItem key={page.label} onClick={() => setAnchorElNav(null)}>
                  <RouterLink to={page.path} style={{ textDecoration: 'none', color: 'inherit' }}>
                    <Typography sx={{ textAlign: 'center' }}>{page.label}</Typography>
                  </RouterLink>
                </MenuItem>
              ))}
            </Menu>
          </Box>

          <Box
            sx={{ mr: 2, display: { xs: 'flex', md: 'none' }, flexGrow: 1, alignItems: 'center' }}
          >
            <RouterLink to="/">
              <Box component="img" src="/logo_white.svg" alt="WATODO" sx={{ height: 32 }} />
            </RouterLink>
          </Box>

          <Box sx={{ flexGrow: 1, display: { xs: 'none', md: 'flex' } }}>
            {pages.map(page => (
              <Button
                key={page.label}
                component={RouterLink}
                to={page.path}
                sx={{ my: 2, color: 'white', display: 'block' }}
              >
                {page.label}
              </Button>
            ))}
          </Box>

          <Box sx={{ flexGrow: 0, display: 'flex', alignItems: 'center' }}>
            <Box sx={{ mr: 2, display: { xs: 'none', md: 'flex' }, alignItems: 'center' }}>
              <OrganizationSelector onDark />
            </Box>
            <Typography sx={{ mr: 1, display: { xs: 'none', md: 'block' } }}>
              {currentUser?.name}
            </Typography>
            <Tooltip title={t('nav.openSettings')}>
              <IconButton onClick={e => setAnchorElUser(e.currentTarget)} sx={{ p: 0 }}>
                <Avatar alt={currentUser?.name ?? t('nav.userAvatar')} />
              </IconButton>
            </Tooltip>
            <Menu
              sx={{ mt: '45px' }}
              id="menu-user"
              anchorEl={anchorElUser}
              anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
              keepMounted
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
              open={Boolean(anchorElUser)}
              onClose={() => setAnchorElUser(null)}
            >
              {settings.map(setting => (
                <MenuItem key={setting.key} onClick={() => handleSettingClick(setting.key)}>
                  <Typography sx={{ textAlign: 'center' }}>{setting.label}</Typography>
                </MenuItem>
              ))}
            </Menu>
          </Box>
        </Toolbar>
      </Container>
    </AppBar>
  );
}

export default NavBar;
