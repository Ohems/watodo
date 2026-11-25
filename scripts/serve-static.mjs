// Static file server for the built frontend (frontend/dist) with a reverse
// proxy for the API, used by the Docker image. The web server listens on
// WEB_PORT (default 8080) and forwards /api and /docs requests to the backend
// at API_URL (default http://127.0.0.1:3000), so the whole app is served from
// one origin (the frontend calls the API with relative URLs).
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, request as httpRequest } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const distDir = resolve(fileURLToPath(new URL('../frontend/dist', import.meta.url)));
const webPort = Number(process.env.WEB_PORT ?? 8080);
const apiUrl = new URL(process.env.API_URL ?? 'http://127.0.0.1:3000');

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

function proxyToApi(req, res) {
  const proxyReq = httpRequest(
    {
      protocol: apiUrl.protocol,
      hostname: apiUrl.hostname,
      port: apiUrl.port || (apiUrl.protocol === 'https:' ? 443 : 80),
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: apiUrl.host },
    },
    proxyRes => {
      res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );
  proxyReq.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Bad gateway: the API server is unreachable');
  });
  req.pipe(proxyReq);
}

function serveStatic(res, pathname) {
  let filePath = normalize(join(distDir, pathname));
  if (filePath !== distDir && !filePath.startsWith(distDir + sep)) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    // SPA fallback: unknown paths get index.html
    filePath = join(distDir, 'index.html');
  }
  const headers = {
    'content-type': mimeTypes[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
  };
  if (filePath.endsWith('index.html')) headers['cache-control'] = 'no-cache';
  res.writeHead(200, headers);
  createReadStream(filePath).pipe(res);
}

const server = createServer((req, res) => {
  const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
  if (
    pathname === '/api' ||
    pathname.startsWith('/api/') ||
    pathname === '/docs' ||
    pathname.startsWith('/docs/')
  ) {
    proxyToApi(req, res);
    return;
  }
  serveStatic(res, pathname);
});

server.listen(webPort, '0.0.0.0', () => {
  console.log(
    `Watodo web server listening on http://0.0.0.0:${webPort} (serving ${distDir}, API at ${apiUrl})`,
  );
});
