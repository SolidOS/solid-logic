export function preferencesFileDocument(): string {
    return [
        '@prefix dct: <http://purl.org/dc/terms/>.',
        '@prefix pim: <http://www.w3.org/ns/pim/space#>.',
        '@prefix solid: <http://www.w3.org/ns/solid/terms#>.',
        '<>',
        '    a pim:ConfigurationFile ;',
        '    dct:title "Preferences file".'
    ].join('\n')
}
