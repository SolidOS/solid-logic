import * as rdf from 'rdflib'
import { getArchiveUrl, uniqueNodes } from '../src/util/utils'

describe('utils', () => {
    describe('uniqueNodes', () => {
        it('exists', () => {
            expect(uniqueNodes).toBeInstanceOf(Function)
        })
        it('removed duplicates', async () => {
            const input = [ rdf.sym('https://a.com/'), rdf.sym('https://b.com/'), rdf.sym('https://a.com/'), rdf.sym('https://a.com/'), rdf.sym('https://c.com/'),  ]
            const expected = [ rdf.sym('https://a.com/'), rdf.sym('https://b.com/'), rdf.sym('https://c.com/'),  ]
            const result =  uniqueNodes(input)
            expect(result).toEqual(expected)

        })
        it('handles an empty array', async () => {
            const result = await uniqueNodes([])
            expect(result).toEqual([])
        })
    })

    describe('getArchiveUrl', () => {
        it('produces the right URL in February', () => {
            const url = getArchiveUrl('https://example.com/inbox/asdf-qwer-asdf-qwer', new Date('7 Feb 2062 UTC'))
            expect(url).toEqual('https://example.com/inbox/archive/2062/02/07/asdf-qwer-asdf-qwer')
        })
        it('produces the right URL in November', () => {
            const url = getArchiveUrl('https://example.com/inbox/asdf-qwer-asdf-qwer', new Date('12 Nov 2012 UTC'))
            expect(url).toEqual('https://example.com/inbox/archive/2012/11/12/asdf-qwer-asdf-qwer')
        })
    })
})