/**
 * Login callback URL workaround for Pivot / Community Solid Server setups.
 *
 * After login the identity provider sends the browser back to the redirect URL with
 * `?code=…&state=…&iss=…` appended. Pivot's PivotResponseWriter answers a GET that is
 * refused (401/403/404) on a URL not ending in `/` with a 301 to the same path plus `/`.
 * It checks the raw URL, query included, and drops the query from the redirect. So a
 * callback to a private container or server root, e.g. `http://localhost:3200/?code=…`,
 * is redirected to `http://localhost:3200//` and the login is lost.
 *
 * When the page is a container (its path ends in `/`), the callback is therefore sent to
 * a child path that does not exist. The server answers it with the data browser without
 * redirecting and the query survives. Once the callback has been handled, the
 * marker is removed from the address bar so the app shows the original page.
 *
 * Remove this once Pivot no longer redirects such URLs (see mydocs/pivotchange.md).
 */

export const LOGIN_CALLBACK_SEGMENT = '.oidc-callback'

/** The URL the identity provider should send the browser back to after login. */
export function loginCallbackUrl (pageUrl: string): string {
  const url = new URL(pageUrl)
  url.hash = ''
  if (url.pathname.endsWith('/')) url.pathname += LOGIN_CALLBACK_SEGMENT
  return url.href
}

/** After the callback has been handled, show the page the login started from again. */
export function restorePageAfterLoginCallback (): void {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (!url.pathname.endsWith('/' + LOGIN_CALLBACK_SEGMENT)) return
  url.pathname = url.pathname.slice(0, -LOGIN_CALLBACK_SEGMENT.length)
  window.history.replaceState(window.history.state, document.title, url.href)
}
