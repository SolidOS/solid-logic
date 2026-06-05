/**
 * Issuer discovery utilities.
 *
 * Resolves OIDC issuer endpoints from /.well-known/openid-configuration
 * so that login can use the canonical issuer host.
 */

async function discoverIssuerFromWellKnown (issuer: string): Promise<string | null> {
  try {
    const issuerUrl = new URL(issuer)
    const wellKnownUrl = new URL('/.well-known/openid-configuration', issuerUrl.origin)
    const wellKnownResponse = await fetch(wellKnownUrl.toString(), { credentials: 'include' })
    if (!wellKnownResponse.ok) {
      return null
    }

    const wellKnownPayload = await wellKnownResponse.json()
    if (typeof wellKnownPayload?.issuer !== 'string' || !wellKnownPayload.issuer) {
      return null
    }

    return wellKnownPayload.issuer.replace(/\/$/, '')
  } catch (_err) {
    return null
  }
}

export async function resolveIssuerForLogin (issuer: string): Promise<string> {
  // Prefer the issuer advertised by discovery; if app and issuer hosts still differ,
  // redirecting to the canonical issuer host is cleaner than rewriting the issuer here.
  const discoveredIssuer = await discoverIssuerFromWellKnown(issuer)
  if (discoveredIssuer) {
    return discoveredIssuer
  }
  return issuer
}
