import {
  ActionIcon,
  Avatar,
  Box,
  Button,
  Container,
  Group,
  Menu,
  Text,
  Tooltip,
} from '@mantine/core';
import { IconMenu2 } from '@tabler/icons-react';
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
    if (setting === 'logout') {
      dispatch(logout());
    } else if (setting === 'account') {
      navigate('/account');
    }
  };

  return (
    <Box
      component="header"
      style={{
        backgroundColor: 'var(--mantine-color-blue-7)',
        color: 'white',
      }}
    >
      <Container size="xl">
        <Group justify="space-between" h={56} wrap="nowrap">
          {/* Desktop logo */}
          <Box visibleFrom="md">
            <RouterLink to="/">
              <Box
                component="img"
                src="/logo_white.svg"
                alt="WATODO"
                style={{ height: 36, display: 'block' }}
              />
            </RouterLink>
          </Box>

          {/* Mobile menu */}
          <Group hiddenFrom="md" wrap="nowrap" style={{ flex: 1 }}>
            <Menu width={260}>
              <Menu.Target>
                <ActionIcon
                  variant="subtle"
                  color="white"
                  size="lg"
                  aria-label={t('nav.navigationMenu')}
                >
                  <IconMenu2 size={20} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Box p="xs" style={{ borderBottom: '1px solid var(--mantine-color-gray-3)' }}>
                  <OrganizationSelector />
                </Box>
                {pages.map(page => (
                  <Menu.Item key={page.label} component={RouterLink} to={page.path}>
                    {page.label}
                  </Menu.Item>
                ))}
              </Menu.Dropdown>
            </Menu>
            <Box style={{ flex: 1 }}>
              <RouterLink to="/">
                <Box
                  component="img"
                  src="/logo_white.svg"
                  alt="WATODO"
                  style={{ height: 32, display: 'block' }}
                />
              </RouterLink>
            </Box>
          </Group>

          {/* Desktop navigation links */}
          <Group gap="xs" visibleFrom="md">
            {pages.map(page => (
              <Button
                key={page.label}
                component={RouterLink}
                to={page.path}
                variant="subtle"
                color="white"
              >
                {page.label}
              </Button>
            ))}
          </Group>

          {/* Right side: org selector, user name, avatar menu */}
          <Group gap="sm" wrap="nowrap">
            <Box visibleFrom="md">
              <OrganizationSelector onDark />
            </Box>
            <Text size="sm" visibleFrom="md" c="white">
              {currentUser?.name}
            </Text>
            <Menu position="bottom-end">
              <Menu.Target>
                <Tooltip label={t('nav.openSettings')}>
                  <ActionIcon variant="subtle" radius="xl">
                    <Avatar alt={currentUser?.name ?? t('nav.userAvatar')} radius="xl" />
                  </ActionIcon>
                </Tooltip>
              </Menu.Target>
              <Menu.Dropdown>
                {settings.map(setting => (
                  <Menu.Item key={setting.key} onClick={() => handleSettingClick(setting.key)}>
                    {setting.label}
                  </Menu.Item>
                ))}
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
      </Container>
    </Box>
  );
}

export default NavBar;
