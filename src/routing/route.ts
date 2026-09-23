import { useEffect, useState } from 'react';

/**
 * Stage 7 · The smallest routing this product can have.
 *
 * WHY THERE IS NO LIBRARY HERE.
 *
 * There was no routing before this stage: the application switched surfaces
 * with a `currentTab` string in React state, which is why a decision could be
 * on screen and have no address. Stage 7 needs two addresses — `/decisions`
 * and `/decisions/:id` — because §3's acceptance test is that a direct
 * navigation and a browser refresh both land on the stored decision.
 *
 * Two addresses do not need a router. What they need is the History API, which
 * every browser has: `pushState` to move, `popstate` to hear the back button,
 * and `location.pathname` to read where we are. A routing library would add a
 * dependency to the bundle, a second way of expressing navigation, and its own
 * opinions about layout — for two paths.
 *
 * The server already returns `index.html` for any unmatched path, in
 * development through Vite's SPA middleware and in production through the
 * catch-all in `server.ts`, so a refresh on `/decisions/DEC-…` reaches the
 * application rather than a 404. Nothing on the server changed for this stage.
 */

export type Route =
  | { name: 'run' }
  | { name: 'decisions' }
  | { name: 'decision'; id: string };

export const DECISIONS_PATH = '/decisions';

/**
 * Read a path as a route.
 *
 * An id in the path is not trusted: it is handed to the store as written, and
 * the store answers `null` for anything it does not hold. Nothing here tries
 * to repair or guess at a malformed id.
 */
export function routeFromPath(pathname: string): Route {
  const trimmed = pathname.replace(/\/+$/, '');
  if (trimmed === DECISIONS_PATH) return { name: 'decisions' };
  if (trimmed.startsWith(`${DECISIONS_PATH}/`)) {
    const id = decodeURIComponent(trimmed.slice(DECISIONS_PATH.length + 1));
    // A path with a trailing segment but nothing in it is the list, not a
    // decision with an empty name.
    return id ? { name: 'decision', id } : { name: 'decisions' };
  }
  return { name: 'run' };
}

export function pathForRoute(route: Route): string {
  switch (route.name) {
    case 'decisions':
      return DECISIONS_PATH;
    case 'decision':
      return `${DECISIONS_PATH}/${encodeURIComponent(route.id)}`;
    case 'run':
      return '/';
  }
}

/** Move, and tell the application. One event, so one listener is enough. */
export function navigate(route: Route): void {
  const path = pathForRoute(route);
  if (path !== window.location.pathname) {
    window.history.pushState({}, '', path);
  }
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/** The current route, kept in step with the address bar and the back button. */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => routeFromPath(window.location.pathname));

  useEffect(() => {
    const onPopState = () => setRoute(routeFromPath(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  return route;
}
