import { NamedNode, st } from "rdflib";
import { findAclDocUrl } from "../acl/aclLogic";
import { CrossOriginForbiddenError, FetchError, NotEditableError, SameOriginForbiddenError, UnauthorizedError, WebOperationError } from "../logic/CustomError";
import { solidLogicSingleton } from "../logic/solidLogicSingleton";
import { isContainer, getContainerMembers } from "./containerLogic";
import { differentOrigin } from "./utils";
/**
 * Create a resource if it really does not exist
 * Be absolutely sure something does not exist before creating a new empty file
 * as otherwise existing could  be deleted.
 * @param doc {NamedNode} - The resource
 */
export async function loadOrCreateIfNotExists (doc: NamedNode) {
    let response
    try {
    response = await solidLogicSingleton.store.fetcher.load(doc)
    } catch (err) {
        if (err.response.status === 404) {
          try {
              await solidLogicSingleton.store.fetcher.webOperation('PUT', doc, {data: '', contentType: 'text/turtle'})
          } catch (err) {
              const msg = 'createIfNotExists: PUT FAILED: ' + doc + ': ' + err
              throw new WebOperationError(msg)
          }
          await solidLogicSingleton.store.fetcher.load(doc)
        } else {
          if (err.response.status === 401) {
            throw new UnauthorizedError();
          }
          if (err.response.status === 403) {
              if (differentOrigin(doc)) {
              throw new CrossOriginForbiddenError();
              }
              throw new SameOriginForbiddenError();
          }
          const msg = 'createIfNotExists doc load error NOT 404:  ' + doc + ': ' + err
          throw new FetchError(err.status, err.message + msg)
        }
    }
    return response
}

/* Follow link from this doc to another thing, or else make a new link
**
** return: null no ld one and failed to make a new one
*/
export async function followOrCreateLink (subject: NamedNode, predicate: NamedNode,
  object: NamedNode, doc: NamedNode
): Promise<NamedNode | null> {
    await solidLogicSingleton.store.fetcher.load(doc)
    const result = solidLogicSingleton.store.any(subject, predicate, null, doc)

    if (result) return result as NamedNode
    if (!solidLogicSingleton.store.updater.editable(doc)) {
        //return null
        const msg = `followOrCreateLink: cannot edit ${doc.value}`
        console.warn(msg)
        throw new NotEditableError(msg)
    }
    try {
        await solidLogicSingleton.store.updater.update([], [ st(subject, predicate, object, doc)])
    } catch (err) {
        const msg = `followOrCreateLink: Error making link in ${doc} to ${object}: ${err}`
        console.warn(msg)
        throw new WebOperationError(err)
      //throw err
        //console.warn(`followOrCreateLink: Error making link in ${doc} to ${object}: ${err}`)
        //return null
    }

    try {
        await loadOrCreateIfNotExists(object)
        // store.fetcher.webOperation('PUT', object, { data: '', contentType: 'text/turtle'})
    } catch (err) {
      console.warn(`followOrCreateLink: Error loading or saving new linked document: ${object}: ${err}`)
      throw err;
    }
    return object
}

// Copied from https://github.com/solidos/web-access-control-tests/blob/v3.0.0/test/surface/delete.test.ts#L5
export async function setSinglePeerAccess(options: {
    ownerWebId: string,
    peerWebId: string,
    accessToModes?: string,
    defaultModes?: string,
    target: string
  }) {
    let str = [
      '@prefix acl: <http://www.w3.org/ns/auth/acl#>.',
      '',
      `<#alice> a acl:Authorization;\n  acl:agent <${options.ownerWebId}>;`,
      `  acl:accessTo <${options.target}>;`,
      `  acl:default <${options.target}>;`,
      '  acl:mode acl:Read, acl:Write, acl:Control.',
      ''
    ].join('\n')
    if (options.accessToModes) {
      str += [
        '<#bobAccessTo> a acl:Authorization;',
        `  acl:agent <${options.peerWebId}>;`,
        `  acl:accessTo <${options.target}>;`,
        `  acl:mode ${options.accessToModes}.`,
        ''
      ].join('\n')
    }
    if (options.defaultModes) {
      str += [
        '<#bobDefault> a acl:Authorization;',
        `  acl:agent <${options.peerWebId}>;`,
        `  acl:default <${options.target}>;`,
        `  acl:mode ${options.defaultModes}.`,
        ''
      ].join('\n')
    }
    const aclDocUrl = await findAclDocUrl(options.target);
    return solidLogicSingleton.store.fetcher._fetch(aclDocUrl, {
      method: 'PUT',
      body: str,
      headers: [
        [ 'Content-Type', 'text/turtle' ]
      ]
    });
}

export async function recursiveDelete(url: string) {
    try {
      if (isContainer(url)) {
        const aclDocUrl = await findAclDocUrl(url);
        await solidLogicSingleton.store.fetcher._fetch(aclDocUrl, { method: "DELETE" });
        const containerMembers = await getContainerMembers(url);
        await Promise.all(
          containerMembers.map((url) => recursiveDelete(url))
        );
      }
      return solidLogicSingleton.store.fetcher._fetch(url, { method: "DELETE" });
    } catch (e) {
      // console.log(`Please manually remove ${url} from your system under test.`, e);
    }
}

export async function createEmptyRdfDoc(doc: NamedNode, comment: string) {
    await solidLogicSingleton.store.fetcher.webOperation("PUT", doc.uri, {
    data: `# ${new Date()} ${comment}
`,
    contentType: "text/turtle",
    });
}
  
