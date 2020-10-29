
const rdf = require('rdflib');

const ACL_LINK = rdf.sym('http://www.iana.org/assignments/link-relations/acl')

export function getStore(authFetcher) {
  if (!authFetcher) {
    throw new Error('please pass authFetcher to getStore!');
  }
  var store = rdf.graph() // Make a Quad store
  rdf.fetcher(store, { fetch: authFetcher.fetch.bind(authFetcher) }) // Attach a web I/O module, store.fetcher
  store.updater = new rdf.UpdateManager(store) // Add real-time live updates store.updater
  return store;
}

export async function findAclDocUrl(url, authFetcher) {
  const store = getStore(authFetcher);
  const doc = store.sym(url);
  await store.fetcher.load(doc);
  const docNode = store.any(doc, ACL_LINK);
  if (!docNode) {
    throw new Error(`No ACL link discovered for ${url}`);
  }
  return docNode.value;
}
