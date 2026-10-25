import { vi } from 'vitest';

export interface RecordedCall {
  method: string;
  url: string;
  body: unknown;
}

type PathMatcher = string | RegExp;

interface Route {
  method: string;
  path: PathMatcher;
  response: unknown | (() => unknown);
  status: number | (() => number);
}

export interface MockApi {
  /** Every fetch call made so far, in order. */
  calls: RecordedCall[];
  /**
   * Registers a JSON response for requests with the given method and path.
   * A string path matches the URL pathname exactly (query string ignored); a
   * RegExp is tested against pathname + query string. The response and the
   * status may be functions to compute them per request. When several routes
   * match a request, the most recently registered one wins.
   */
  on: (
    method: string,
    path: PathMatcher,
    response: unknown | (() => unknown),
    status?: number | (() => number),
  ) => void;
  /** Number of recorded calls matching the method and path. */
  callCount: (method: string, path: PathMatcher) => number;
  /** The parsed body of the last call matching the method and path. */
  lastBody: (method: string, path: PathMatcher) => unknown;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function matches(path: PathMatcher, pathname: string, search: string): boolean {
  return typeof path === 'string' ? pathname === path : path.test(`${pathname}${search}`);
}

/** Stubs the global fetch with a route-based JSON mock. */
export function mockApi(): MockApi {
  const calls: RecordedCall[] = [];
  const routes: Route[] = [];

  const fetchMock = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
    const request = input instanceof Request ? input : new Request(input);
    const url = new URL(request.url);
    const text = await request.clone().text();
    let body: unknown;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    calls.push({ method: request.method, url: request.url, body });
    // The most recently registered matching route wins, so tests can override
    // routes registered by a shared setup helper.
    for (let index = routes.length - 1; index >= 0; index--) {
      const route = routes[index];
      if (route.method === request.method && matches(route.path, url.pathname, url.search)) {
        const payload = typeof route.response === 'function' ? route.response() : route.response;
        const status = typeof route.status === 'function' ? route.status() : route.status;
        return jsonResponse(payload, status);
      }
    }
    return jsonResponse({ error: 'Not found' }, 404);
  });

  vi.stubGlobal('fetch', fetchMock);

  const api: MockApi = {
    calls,
    on: (method, path, response, status = 200) => {
      routes.push({ method, path, response, status });
    },
    callCount: (method, path) => {
      const url = (call: RecordedCall) => new URL(call.url);
      return calls.filter(call => {
        const parsed = url(call);
        return call.method === method && matches(path, parsed.pathname, parsed.search);
      }).length;
    },
    lastBody: (method, path) => {
      const url = (call: RecordedCall) => new URL(call.url);
      const matching = calls.filter(call => {
        const parsed = url(call);
        return call.method === method && matches(path, parsed.pathname, parsed.search);
      });
      return matching.at(-1)?.body;
    },
  };
  return api;
}
