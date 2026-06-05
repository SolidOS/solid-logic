export type ServerLogoutOptions = {
  issuer?: string
  postLogoutRedirectPath?: string
}

export async function performServerSideLogout (options: ServerLogoutOptions = {}): Promise<boolean> {
  if (typeof window === 'undefined') {
    return false
  }
  const issuer = options.issuer || ''
  const postLogoutRedirectPath = options.postLogoutRedirectPath || '/'

  // Provider-specific logout endpoint discovery (OIDC end_session_endpoint).
  try {
    if (issuer) {
      const wellKnownUri = new URL(issuer)
      wellKnownUri.pathname = '/.well-known/openid-configuration'
      const wellKnownResult = await fetch(wellKnownUri.toString(), { credentials: 'include' })

      if (wellKnownResult.status === 200) {
        const openidConfiguration = await wellKnownResult.json()
        if (openidConfiguration && openidConfiguration.end_session_endpoint) {
          await fetch(openidConfiguration.end_session_endpoint, { credentials: 'include' })
        }
      }
    }
  } catch (_err) {
    // Continue with local logout even if provider logout is unavailable.
  }

  // NSS well-known logout endpoint clears cookie-backed server sessions.
  try {
    const logoutResponse = await fetch('/.well-known/solid/logout', { credentials: 'include' })
    if (logoutResponse.ok || logoutResponse.redirected) {
      window.location.assign(postLogoutRedirectPath)
      return true
    }
  } catch (_err) {
    // Not all deployments expose this endpoint.
  }

  return false
}