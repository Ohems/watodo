// Entrypoint of the Docker image: starts the API server (backend/dist) and the
// static web server (scripts/serve-static.mjs), and shuts both down when
// either process exits or a termination signal arrives. The command can be
// overridden, e.g. `docker run ohems/watodo npm run migrate -w backend`.
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));

const children = [];

let shuttingDown = false;
function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill('SIGTERM');
  process.exit(code);
}

function start(args, cwd) {
  const child = spawn(process.execPath, args, { cwd, stdio: 'inherit', env: process.env });
  child.on('exit', (code, signal) => {
    console.log(
      `Process "${args.join(' ')}" exited (code ${code ?? 'null'}, signal ${signal ?? 'none'}); shutting down`,
    );
    shutdown(code ?? 1);
  });
  children.push(child);
}

start(['dist/index.js'], join(appRoot, 'backend'));
start(['scripts/serve-static.mjs'], appRoot);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => shutdown(0));
}
