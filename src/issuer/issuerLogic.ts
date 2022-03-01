const DEFAULT_ISSUERS = [
  {
    name: 'Solid Community',
    uri: 'https://solidcommunity.net'
  },
  {
    name: 'Solid Web',
    uri: 'https://solidweb.org'
  },
  {
    name: 'Inrupt.net',
    uri: 'https://inrupt.net'
  },
  {
    name: 'pod.Inrupt.com',
    uri: 'https://broker.pod.inrupt.com'
  }
]

/**
 * @returns - A list of suggested OIDC issuers
 */
export function getSuggestedIssuers (): { name: string, uri: string }[] {
    // Suggest a default list of OIDC issuers
    const issuers = [...DEFAULT_ISSUERS]
  
    // Suggest the current host if not already included
    const { host, origin } = new URL(location.href)
    const hosts = issuers.map(({ uri }) => new URL(uri).host)
    if (!hosts.includes(host) && !hosts.some(existing => isSubdomainOf(host, existing))) {
      issuers.unshift({ name: host, uri: origin })
    }
  
    return issuers
  }
  
function isSubdomainOf (subdomain: string, domain: string): boolean {
    const dot = subdomain.length - domain.length - 1
    return dot > 0 && subdomain[dot] === '.' && subdomain.endsWith(domain)
}