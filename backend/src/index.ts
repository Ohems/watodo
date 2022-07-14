import { init, start } from "./server";

async function main() {
  await init();
  await start();
}

main().catch(console.error)
