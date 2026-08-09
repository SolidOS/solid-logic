import { NamedNode, sym } from 'rdflib'
import { type AclLogic, type ResourceDeleteOptions, type ResourceLogic, type TypeIndexLogic } from '../types'

const LDP_CONTAINS = sym('http://www.w3.org/ns/ldp#contains')

export function createResourceLogic(store, aclLogic: AclLogic, containerLogic, typeIndexLogic: TypeIndexLogic): ResourceLogic {
  function createContainer(url: string) {
    return containerLogic.createContainer(url)
  }

  function isContainer(resourceNode: NamedNode) {
    return containerLogic.isContainer(resourceNode)
  }

  function getContainerMemberCount(resourceNode: NamedNode) {
    return containerLogic.getContainerMemberCount(resourceNode)
  }

  async function deleteTypeIndexesForResource(resourceNode: NamedNode, user?: NamedNode | null) {
    if (!user) return

    try {
      await typeIndexLogic.deleteTypeIndexRegistrationForResource(resourceNode, user)
    } catch (_error) {
      // Keep resource deletion best-effort even if type-index cleanup fails.
    }
  }

  async function recursiveDelete(resourceNode: NamedNode, options: ResourceDeleteOptions = {}) {
    try {
      const resourceParent = resourceNode.dir()

      if (isContainer(resourceNode)) {
        const containerMembers = await containerLogic.getContainerMembers(resourceNode)
        await Promise.all(containerMembers.map((url) => recursiveDelete(url, options)))
      }

      if (options.deleteTypeIndexes) {
        await deleteTypeIndexesForResource(resourceNode, options.user)
      }

      try {
        const aclDocUrl = await aclLogic.findAclDocUrl(resourceNode)
        if (aclDocUrl) {
          await store.fetcher._fetch(aclDocUrl, { method: 'DELETE' })
          store.fetcher.unload(sym(aclDocUrl))
        }
      } catch (_error) {
          store.fetcher.unload(resourceNode.doc())
      }

      if (resourceParent) {
        store.removeMatches(resourceParent, LDP_CONTAINS, resourceNode, resourceParent.doc())
      }

      const deleted = await store.fetcher._fetch(resourceNode.value, { method: 'DELETE' })
      store.removeDocument(resourceNode)
      store.fetcher.unload(resourceNode.doc())
      return deleted
    } catch (_error) {
      // Keep the delete best-effort; callers can surface a higher-level error if needed.
    }
  }

  async function deleteResourceAndTypeIndexIfExists(resourceNode: NamedNode, user?: NamedNode | null) {
    await recursiveDelete(resourceNode, { deleteTypeIndexes: true, user })
  }

  return {
    recursiveDelete,
    deleteResourceAndTypeIndexIfExists,
    createContainer,
    isContainer,
    getContainerMemberCount
  }
}