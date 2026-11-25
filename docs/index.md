---
layout: home

hero:
  name: Watodo
  text: Community event and responsibility management
  tagline: Documentation for self-hosters and organization admins.
  actions:
    - theme: brand
      text: Self-hosting guide
      link: /self-hosting/
    - theme: alt
      text: Admin guide
      link: /admin-guide/
    - theme: alt
      text: Source on GitHub
      link: https://github.com/Ohems/watodo

features:
  - title: Self-hosting
    details: Install, configure and run Watodo on your own server with PostgreSQL and Redis.
    link: /self-hosting/
    icon: ⚙️
  - title: Admin guide
    details: Organizations, roles and permissions, teams, sites and rooms, work roles, event staffing and notifications.
    link: /admin-guide/
    icon: 🧑‍💻
  - title: AI-friendly documentation
    details: Every page is static HTML, and the complete docs are also published as Markdown (llms.txt) for AI assistants.
    link: /llms.txt
    icon: 🤖
---

## Using these docs with AI assistants

Watodo's documentation is plain Markdown in the repository (`docs/`), rendered to
static HTML by [VitePress](https://vitepress.dev). On top of that, the site build
generates two files following the [llms.txt](https://llmstxt.org) convention:

- [`/llms.txt`](/llms.txt): an index of all pages with links and descriptions
- [`/llms-full.txt`](/llms-full.txt): the complete documentation in a single Markdown file

Point an AI assistant or agent at `https://ohems.github.io/watodo/llms-full.txt`
(for example: "Read this file and answer my questions about hosting Watodo") so
people can ask an AI about Watodo without leaving their AI tool. The same files
are linked from every page footer area via the site root.
