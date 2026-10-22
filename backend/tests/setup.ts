import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

// Load the committed test environment (backend/.env.test) before any test file
// is evaluated. dotenv does not override variables that are already set, so
// these values win over the development .env that src/config.ts loads.
config({ path: fileURLToPath(new URL('../.env.test', import.meta.url)) });
