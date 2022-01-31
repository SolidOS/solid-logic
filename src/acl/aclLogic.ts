/**
 * Simple Access Control
 *
 * This function sets up a simple default ACL for a resource, with
 * RWC for the owner, and a specified access (default none) for the public.
 * In all cases owner has read write control.
 * Parameter lists modes allowed to public
 *
 * @param options
 * @param options.public eg ['Read', 'Write']
 *
 * @returns Resolves with aclDoc uri on successful write
 */

import { graph, NamedNode, Namespace, serialize } from "rdflib"
import solidNamespace from 'solid-namespace'
import * as $rdf from 'rdflib'
import { solidLogicSingleton } from "../logic/solidLogicSingleton"
import { ACL_LINK } from "../util/UtilityLogic"

export const ns = solidNamespace($rdf)

export function setACLUserPublic ( 
docURI: string,
me: NamedNode,
options: {
    defaultForNew?: boolean,
    public?: []
}
): Promise<NamedNode> {
const aclDoc = solidLogicSingleton.store.any(
    solidLogicSingleton.store.sym(docURI),
    ACL_LINK
)

return Promise.resolve()
    .then(() => {
    if (aclDoc) {
        return aclDoc as NamedNode
    }

    return fetchACLRel(docURI).catch(err => {
        throw new Error(`Error fetching rel=ACL header for ${docURI}: ${err}`)
    })
    })
    .then(aclDoc => {
    const aclText = genACLText(docURI, me, aclDoc.uri, options)
    if (!solidLogicSingleton.store.fetcher) {
        throw new Error('Cannot PUT this, store has no fetcher')
    }
    return solidLogicSingleton.store.fetcher
        .webOperation('PUT', aclDoc.uri, {
        data: aclText,
        contentType: 'text/turtle'
        })
        .then(result => {
        if (!result.ok) {
            throw new Error('Error writing ACL text: ' + result.error)
        }

        return aclDoc
        })
    })
}

/**
 * @param docURI
 * @returns
 */
function fetchACLRel (docURI: string): Promise<NamedNode> {
    const fetcher = solidLogicSingleton.store.fetcher
    if (!fetcher) {
        throw new Error('Cannot fetch ACL rel, store has no fetcher')
    }

    return fetcher.load(docURI).then(result => {
        if (!result.ok) {
        throw new Error('fetchACLRel: While loading:' + (result as any).error)
        }

        const aclDoc = solidLogicSingleton.store.any(
        solidLogicSingleton.store.sym(docURI),
        ACL_LINK
        )

        if (!aclDoc) {
        throw new Error('fetchACLRel: No Link rel=ACL header for ' + docURI)
        }

        return aclDoc as NamedNode
    })
}

/**
 * @param docURI
 * @param me
 * @param aclURI
 * @param options
 *
 * @returns Serialized ACL
 */
export function genACLText (
docURI: string,
me: NamedNode,
aclURI: string,
options: {
    defaultForNew?: boolean,
    public?: []
} = {}
): string | undefined {
const optPublic = options.public || []
const g = graph()
const auth = Namespace('http://www.w3.org/ns/auth/acl#')
let a = g.sym(`${aclURI}#a1`)
const acl = g.sym(aclURI)
const doc = g.sym(docURI)
g.add(a, ns.rdf('type'), auth('Authorization'), acl)
g.add(a, auth('accessTo'), doc, acl)
if (options.defaultForNew) {
    g.add(a, auth('default'), doc, acl)
}
g.add(a, auth('agent'), me, acl)
g.add(a, auth('mode'), auth('Read'), acl)
g.add(a, auth('mode'), auth('Write'), acl)
g.add(a, auth('mode'), auth('Control'), acl)

if (optPublic.length) {
    a = g.sym(`${aclURI}#a2`)
    g.add(a, ns.rdf('type'), auth('Authorization'), acl)
    g.add(a, auth('accessTo'), doc, acl)
    g.add(a, auth('agentClass'), ns.foaf('Agent'), acl)
    for (let p = 0; p < optPublic.length; p++) {
    g.add(a, auth('mode'), auth(optPublic[p]), acl) // Like 'Read' etc
    }
}
return serialize(acl, g, aclURI)
}
