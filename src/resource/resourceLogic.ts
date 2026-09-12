import { NamedNode, sym, LiveStore } from 'rdflib'
import { ACL_LINK } from '../acl/aclLogic'
import { ns } from '../util/ns'
import { assertSuccessfulHttpResponse, isMissingError } from './resourceHttp'
import { readWacAccessInfo } from './resourceMetadata'
import { type AclLogic, type ResourceAccess, type ResourceAccessWithDelete, type ResourceDeleteOptions, type ResourceLogic, type ResourceMetadata, type ResourceMetadataWithDelete, type TypeIndexLogic } from '../types'

export function createResourceLogic(store: LiveStore, aclLogic: AclLogic, containerLogic, typeIndexLogic: TypeIndexLogic): ResourceLogic {
  function createContainer(url: string) {
    return containerLogic.createContainer(url)
  }

  function isContainer(resourceNode: NamedNode) {
    return containerLogic.isContainer(resourceNode)
  }

  function getContainerMemberCount(resourceNode: NamedNode) {
    return containerLogic.getContainerMemberCount(resourceNode)
  }

  function readMetadata(subject: NamedNode, response: Response): ResourceMetadata {
    let contentType: string | undefined
    let canEdit = false
    let isPublic = false
    let eTag: string | undefined
    let modified: string | undefined

    if (response.headers) {
      const contentTypeHeader = response.headers.get('content-type')
      contentType = contentTypeHeader?.split(';')[0] ?? undefined

      const accessFlags = readWacAccessInfo(response.headers.get('wac-allow'))
      canEdit = accessFlags.canEdit
      isPublic = accessFlags.isPublic
      eTag = response.headers.get('etag') ?? undefined
      modified = store.anyValue(subject as any, ns.dct('modified')) || store.anyValue(subject as any, ns.dc('modified')) || undefined
    }

    if ((!response.headers || !response.headers.get('content-type')) && (!response.headers || !response.headers.get('wac-allow') || !response.headers.get('etag'))) {
      const reqs = store.each(
        null,
        store.sym('http://www.w3.org/2007/ont/link#requestedURI'),
        subject
      )
      reqs.map((req: any) => {
        const responseNode = store.any(
          req as any,
          store.sym('http://www.w3.org/2007/ont/link#response')
        )
        if (responseNode && responseNode.termType === 'NamedNode') {
          const responseContentType = store.anyValue(responseNode as any, ns.httph('content-type')) || undefined
          if (contentType === undefined) {
            contentType = responseContentType
          }
          const wacAllow = (store.anyValue(responseNode as any, ns.httph('wac-allow')) as string | undefined) ||
            (store.anyValue(responseNode as any, ns.httph('WAC-Allow')) as string | undefined)
          const accessFlags = readWacAccessInfo(wacAllow)
          canEdit = canEdit || accessFlags.canEdit
          isPublic = isPublic || accessFlags.isPublic
          const responseETag = store.anyValue(responseNode as any, ns.httph('etag')) || undefined
          if (eTag === undefined) {
            eTag = responseETag
          }
          modified = store.anyValue(subject as any, ns.dct('modified')) || store.anyValue(subject as any, ns.dc('modified')) || undefined
        }
      })
    }

    const aclUri = store.any(subject, ACL_LINK)?.value || undefined
    const access: ResourceAccess = { canEdit, isPublic }
    return { contentType, access, aclUri, eTag, modified }
  }

  async function fetchHeadMetadata(subject: NamedNode): Promise<ResourceMetadata> {
    const response = await store.fetcher.webOperation('HEAD', subject.uri)
    assertSuccessfulHttpResponse(response, 'HEAD')
    return readMetadata(subject, response)
  }

  async function userCanWriteToContainingContainer(resourceNode: NamedNode): Promise<boolean> {
    const containerNode = store.any(resourceNode, ns.ldp('contains')) || resourceNode.dir()
    if (!containerNode || containerNode.termType !== 'NamedNode') {
      return false
    }

    try {
      const containerMetadata = await fetchHeadMetadata(containerNode as NamedNode)
      return containerMetadata.access.canEdit
    } catch (_error) {
      return false
    }
  }

  async function userCanDeleteResource(resourceNode: NamedNode): Promise<boolean> {
    return userCanWriteToContainingContainer(resourceNode)
  }

  async function fetchMetadata(subject: NamedNode): Promise<ResourceMetadata> {
    return fetchHeadMetadata(subject)
  }

  async function fetchMetadataWithDelete(subject: NamedNode): Promise<ResourceMetadataWithDelete> {
    let resourceMetadata: ResourceMetadata

    try {
      resourceMetadata = await fetchHeadMetadata(subject)
    } catch (_error) {
      resourceMetadata = {
        contentType: undefined,
        access: { canEdit: false, isPublic: false },
        aclUri: undefined,
        eTag: undefined,
        modified: undefined
      }
    }

    const canDelete = await userCanDeleteResource(subject)
    const access: ResourceAccessWithDelete = {
      canEdit: resourceMetadata.access?.canEdit ?? false,
      isPublic: resourceMetadata.access?.isPublic ?? false,
      canDelete
    }
    return { ...resourceMetadata, access }
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
    const resourceParent = resourceNode.dir()

    if (isContainer(resourceNode)) {
      const containerMembers = await containerLogic.getContainerMembers(resourceNode)
      await Promise.all(containerMembers.map((url) => recursiveDelete(sym(url), options)))
    }

    let deleted
    try {
      deleted = await store.fetcher._fetch(resourceNode.value, { method: 'DELETE' })
      assertSuccessfulHttpResponse(deleted, 'DELETE', { allowNotFound: true })
    } catch (error) {
      if (!isMissingError(error)) {
        throw error
      }
    }

    if (options.deleteTypeIndexes) {
      await deleteTypeIndexesForResource(resourceNode, options.user)
    }

    if (resourceParent) {
      store.removeMatches(resourceParent, ns.ldp('contains'), resourceNode, resourceParent.doc())
    }

    store.removeDocument(resourceNode)
    store.fetcher.unload(resourceNode.doc())
    return deleted
  }

  async function deleteResourceAndTypeIndexIfExists(resourceNode: NamedNode, user?: NamedNode | null) {
    await recursiveDelete(resourceNode, { deleteTypeIndexes: true, user })
  }

  async function checkAndRefreshEditable(resourceNode: NamedNode | null | undefined): Promise<boolean> {
    if (!resourceNode || !store.updater || !store.fetcher || typeof store.fetcher.refresh !== 'function') return false

    const resourceUri = resourceNode.uri || resourceNode.value || ''
    if (!resourceUri) return false

    const editable = store.updater.editable(resourceUri, store)
    if (editable !== false && editable !== undefined) {
      return true
    }

    try {
      await store.fetcher.refresh(resourceNode)
    } catch (error) {
      throw error instanceof Error ? error : new Error(`Failed to refresh <${resourceUri}>`)
    }

    const editableAfterRefresh = store.updater.editable(resourceUri, store)
    return editableAfterRefresh !== false && editableAfterRefresh !== undefined
  }

  return {
    recursiveDelete,
    deleteResourceAndTypeIndexIfExists,
    fetchMetadata,
    fetchMetadataWithDelete,
    checkAndRefreshEditable,
    createContainer,
    isContainer,
    getContainerMemberCount
  }
}
