import { defineConfig } from 'vitepress';

// On GitHub Actions the site is deployed to a project page
// (https://<owner>.github.io/<repo>/), so the base path is the repository name.
// Locally, and for user/organization pages (<owner>.github.io), the base is '/'.
const repository = process.env.GITHUB_REPOSITORY ?? '';
const repositoryName = repository.split('/')[1] ?? '';
const base = repositoryName && !repository.endsWith('.github.io') ? `/${repositoryName}/` : '/';

// Keep in sync with EXCLUDED_FILES in scripts/generate-llms-txt.mjs.
const srcExclude: string[] = [];

export default defineConfig({
  base,
  title: 'Watodo',
  description:
    'Community event and responsibility management tool. Documentation for self-hosters and organization admins.',
  cleanUrls: true,
  srcExclude,
  // localhost URLs in the self-hosting docs are examples, not site links
  ignoreDeadLinks: [/^http:\/\/localhost/],
  head: [['link', { rel: 'icon', href: 'data:,' }]],
  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: 'Self-hosting', link: '/self-hosting/' },
      { text: 'Admin guide', link: '/admin-guide/' },
      {
        text: 'Reference',
        items: [{ text: 'Events internals and API', link: '/Events' }],
      },
      { text: 'GitHub', link: 'https://github.com/Ohems/watodo' },
    ],
    sidebar: {
      '/self-hosting/': [
        {
          text: 'Self-hosting',
          items: [
            { text: 'Overview', link: '/self-hosting/' },
            { text: 'Running with Docker', link: '/self-hosting/docker' },
            { text: 'Configuration', link: '/self-hosting/configuration' },
            { text: 'OAuth login providers', link: '/self-hosting/oauth-providers' },
            { text: 'Production deployment', link: '/self-hosting/production' },
          ],
        },
      ],
      '/admin-guide/': [
        {
          text: 'Organization admin guide',
          items: [
            { text: 'Overview', link: '/admin-guide/' },
            { text: 'Users and permissions', link: '/admin-guide/users-and-permissions' },
            { text: 'Teams', link: '/admin-guide/teams' },
            { text: 'Sites and rooms', link: '/admin-guide/sites-and-rooms' },
            {
              text: 'Work roles and certifications',
              link: '/admin-guide/work-roles-and-certifications',
            },
            { text: 'Events and scheduling', link: '/admin-guide/events' },
            { text: 'Staffing', link: '/admin-guide/staffing' },
            { text: 'Notifications', link: '/admin-guide/notifications' },
          ],
        },
      ],
    },
    search: { provider: 'local' },
    editLink: {
      pattern: 'https://github.com/Ohems/watodo/edit/master/docs/:path',
      text: 'Edit this page on GitHub',
    },
    lastUpdated: true,
    socialLinks: [{ icon: 'github', link: 'https://github.com/Ohems/watodo' }],
    footer: {
      message: 'Released under the MIT License.',
    },
  },
});
