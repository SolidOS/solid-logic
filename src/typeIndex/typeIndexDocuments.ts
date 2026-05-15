export function publicTypeIndexDocument(): string {
    return [
        '@prefix solid: <http://www.w3.org/ns/solid/terms#>.',
        '<>',
        '    a solid:TypeIndex ;',
        '    a solid:ListedDocument.'
    ].join('\n')
}

export function privateTypeIndexDocument(): string {
    return [
        '@prefix solid: <http://www.w3.org/ns/solid/terms#>.',
        '<>',
        '    a solid:TypeIndex ;',
        '    a solid:UnlistedDocument.'
    ].join('\n')
}