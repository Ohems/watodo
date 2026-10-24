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
import { IconChevronDown, IconMenu2 } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../hooks/redux.js';
import { logout } from '../../store/user-slice.js';
import OrganizationSelector from '../OrganizationSelector/OrganizationSelector.js';

interface NavItem {
  label: string;
  path?: string;
  children?: { label: string; path: string }[];
}

function NavBar() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const currentUser = useAppSelector(state => state.user.currentUser);

  const navItems: NavItem[] = [
    { label: t('nav.home'), path: '/' },
    {
      label: t('nav.events'),
      children: [
        { label: t('nav.eventsCalendar'), path: '/events/calendar' },
        { label: t('nav.eventsManagement'), path: '/events/management' },
      ],
    },
    { label: t('nav.teams'), path: '/teams' },
    {
      label: t('nav.organization'),
      children: [
        { label: t('nav.orgGeneral'), path: '/organization/general' },
        { label: t('nav.orgLocations'), path: '/organization/locations' },
        { label: t('nav.orgJobs'), path: '/organization/jobs' },
        { label: t('nav.orgUsers'), path: '/organization/users' },
      ],
    },
  ];

  const settings = [
    { key: 'profile', label: t('nav.profile') },
    { key: 'account', label: t('nav.account') },
    { key: 'logout', label: t('nav.logout') },
  ];

  const isActive = (path: string): boolean => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const handleSettingClick = (setting: string) => {
    if (setting === 'logout') {
      dispatch(logout());
    } else if (setting === 'account') {
      navigate('/account');
    }
  };

  const renderNavButton = (item: NavItem) => {
    if (item.children) {
      const childActive = item.children.some(c => isActive(c.path));
      return (
        <Menu key={item.label} trigger="hover" position="bottom-start">
          <Menu.Target>
            <Button
              variant={childActive ? 'light' : 'subtle'}
              color="white"
              rightSection={<IconChevronDown size={14} />}
            >
              {item.label}
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            {item.children.map(child => (
              <Menu.Item key={child.path} component={RouterLink} to={child.path}>
                {child.label}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
      );
    }
    return (
      <Button
        key={item.label}
        component={RouterLink}
        to={item.path ?? '/'}
        variant={isActive(item.path ?? '/') ? 'light' : 'subtle'}
        color="white"
      >
        {item.label}
      </Button>
    );
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
                {navItems.map(item =>
                  item.children ? (
                    <div key={item.label}>
                      <Menu.Label>{item.label}</Menu.Label>
                      {item.children.map(child => (
                        <Menu.Item key={child.path} component={RouterLink} to={child.path}>
                          {child.label}
                        </Menu.Item>
                      ))}
                    </div>
                  ) : (
                    <Menu.Item key={item.path} component={RouterLink} to={item.path ?? '/'}>
                      {item.label}
                    </Menu.Item>
                  ),
                )}
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
            {navItems.map(renderNavButton)}
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
