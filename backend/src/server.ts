import * as Hapi from "@hapi/hapi";
import { Server } from "@hapi/hapi";

export let server: Server;

export async function init(): Promise<Server> {
  server = Hapi.server({
    port: process.env.PORT || 4000,
    host: '0.0.0.0'
  });

  // Routes will go here

  return server;
};

export async function start(): Promise<void> {
  console.log(`Listening on ${server.settings.host}:${server.settings.port}`);
  return server.start();
};
