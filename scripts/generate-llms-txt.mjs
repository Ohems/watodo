// Generates llms.txt and llms-full.txt into docs/public/ so that AI assistants
// can ingest the whole documentation as Markdown (the llms.txt convention,
// https://llmstxt.org). VitePress copies the public directory to the site root,
// so the files are served at /llms.txt and /llms-full.txt.
// Runs automatically before `npm run docs:dev` and `npm run docs:build` via the
// pre* scripts in the root package.json.
// Keep EXCLUDED_FILES in sync with srcExclude in docs/.vitepress/config.ts.
import { globSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const docsDir = join(scriptsDir, '..', 'docs');
const outDir = join(docsDir, 'public');

const EXCLUDED_FILES = [];

function resolveSiteUrl() {
  if (process.env.SITE_URL) {
    return process.env.SITE_URL.endsWith('/') ? process.env.SITE_URL : `${process.env.SITE_URL}/`;
  }
  const repository = process.env.GITHUB_REPOSITORY ?? 'Ohems/watodo';
  const [owner, name] = repository.split('/');
  if (name && !repository.endsWith('.github.io')) {
    return `https://${owner}.github.io/${name}/`;
  }
  return `https://${owner}.github.io/`;
}

const site = resolveSiteUrl();

/** Route path of a docs Markdown file, e.g. 'self-hosting/index.md' -> 'self-hosting/'. */
function pagePath(relativePath) {
  let path = relativePath.replace(/\.md$/, '');
  if (path === 'index') return '';
  if (path.endsWith('/index')) path = `${path.slice(0, -'/index'.length)}/`;
  return path;
}

function parsePage(relativePath) {
  const raw = readFileSync(join(docsDir, relativePath), 'utf8');
  const body = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();
  const titleMatch = body.match(/^#\s+(.+)$/m);
  let title = relativePath;
  if (titleMatch) {
    title = titleMatch[1].trim();
  } else if (relativePath === 'index.md') {
    title = 'Home';
  }
  return { title, body };
}

const pages = globSync('**/*.md', { cwd: docsDir })
  .map(file => file.replace(/\\/g, '/'))
  .filter(file => !EXCLUDED_FILES.includes(file))
  .sort()
  .map(file => {
    const { title, body } = parsePage(file);
    return { file, title, body, url: `${site}${pagePath(file)}` };
  });

const llmsTxt = [
  '# Watodo documentation',
  '',
  '> Community event and responsibility management tool. Documentation for people hosting',
  '> Watodo themselves and for organization admins of a running instance.',
  '',
  'The full documentation is also available as a single Markdown file for AI assistants:',
  '',
  `- [llms-full.txt](${site}llms-full.txt)`,
  '',
  '## Pages',
  '',
  ...pages.map(page => `- [${page.title}](${page.url})`),
  '',
].join('\n');

const llmsFullTxt = [
  '# Watodo documentation (full)',
  '',
  `Complete Watodo documentation in Markdown. Source: ${site}`,
  '',
  ...pages.flatMap(page => [
    '---',
    '',
    `## ${page.title}`,
    '',
    `Source: ${page.url}`,
    '',
    page.body,
    '',
  ]),
].join('\n');

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'llms.txt'), llmsTxt);
writeFileSync(join(outDir, 'llms-full.txt'), llmsFullTxt);
console.log(`Wrote llms.txt and llms-full.txt (${pages.length} pages) to ${outDir}`);
