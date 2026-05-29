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
    name: 'Solid Web ME',
    uri: 'https://solidweb.me'
  },
  {
    name: 'Inrupt.com',
    uri: 'https://login.inrupt.com'
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
    if (!hosts.includes(host)) {
      issuers.unshift({ name: host, uri: origin })
    }
  
    return issuers
  }