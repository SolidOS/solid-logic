function parseWacAllowHeader (headerValue: string | null | undefined) {
  const permissions = new Map<string, Set<string>>()
  if (!headerValue) return permissions

  for (const entry of headerValue.split(',')) {
    const match = entry.trim().match(/^([A-Za-z]+)\s*=\s*"([^"]*)"$/)
    if (match) {
      const [, permissionGroup, accessModes] = match
      const modes = accessModes.trim().split(/\s+/).filter(Boolean)
      permissions.set(permissionGroup.toLowerCase(), new Set(modes.map(mode => mode.toLowerCase())))
    }
  }

  return permissions
}

export function readWacAccessInfo (wacAllow: string | null | undefined) {
  if (!wacAllow) {
    return { canEdit: false, isPublic: false }
  }

  const permissions = parseWacAllowHeader(wacAllow)
  const userModes = permissions.get('user') ?? new Set<string>()
  const publicModes = permissions.get('public') ?? new Set<string>()

  return {
    canEdit: userModes.has('write'),
    isPublic: publicModes.has('read') || publicModes.has('write')
  }
}