import * as Hapi from "@hapi/hapi";
import { Request, Server } from "@hapi/hapi";

export let server: Server;

function index(request: Request): string {
  console.log("Processing request", request.info.id);
  return "Hello! Nice to have met you.";
}

export async function init(): Promise<Server> {
  server = Hapi.server({
    port: process.env.PORT || 4000,
    host: '0.0.0.0'
  });

  server.route({
    method: "GET",
    path: "/",
    handler: index
  });

  return server;
};

export async function start(): Promise<void> {
  console.log(`Listening on ${server.settings.host}:${server.settings.port}`);
  return server.start();
};
