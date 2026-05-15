export function ownerOnlyContainerAclDocument(webId: string): string {
    return [
        '@prefix acl: <http://www.w3.org/ns/auth/acl#>.',
        '',
        '<#owner>',
        'a acl:Authorization;',
        `acl:agent <${webId}>;`,
        'acl:accessTo <./>;',
        'acl:default <./>;',
        'acl:mode acl:Read, acl:Write, acl:Control.'
    ].join('\n')
}
