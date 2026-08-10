import { NamedNode, sym } from 'rdflib'
import { ACL_LINK } from '../acl/aclLogic'
import { ns } from '../util/ns'
import { readWacAccessInfo } from './resourceMetadata'
import { type AclLogic, type ResourceAccess, type ResourceAccessWithDelete, type ResourceDeleteOptions, type ResourceLogic, type ResourceMetadata, type ResourceMetadataWithDelete, type TypeIndexLogic } from '../types'

function assertSuccessfulResponse(response: Response, method: string) {
  if (response.ok) return

  const message = response.status === 412
    ? 'Error: File changed by someone else'
    : `HTTP error on ${method}! Status: ${response.status}`
  throw new Error(message)
}

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

  function readMetadata(subject: NamedNode, response: Response): ResourceMetadata {
    let contentType: string | undefined
    let canEdit = false
    let isPublic = false
    let eTag: string | undefined
    let modified: string | undefined

    if (response.headers && response.headers.get('content-type')) {
      contentType = response.headers.get('content-type')?.split(';')[0] ?? undefined
      const accessFlags = readWacAccessInfo(response.headers.get('wac-allow'))

      canEdit = accessFlags.canEdit
      isPublic = accessFlags.isPublic
      eTag = response.headers.get('etag') ?? undefined
      modified = store.anyValue(subject as any, ns.dct('modified')) || store.anyValue(subject as any, ns.dc('modified')) || undefined
    } else {
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
          contentType = store.anyValue(responseNode as any, ns.httph('content-type')) || undefined
          const wacAllow = (store.anyValue(responseNode as any, ns.httph('wac-allow')) as string | undefined) ||
            (store.anyValue(responseNode as any, ns.httph('WAC-Allow')) as string | undefined)
          const accessFlags = readWacAccessInfo(wacAllow)
          canEdit = accessFlags.canEdit
          isPublic = accessFlags.isPublic
          eTag = store.anyValue(responseNode as any, ns.httph('etag')) || undefined
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
    assertSuccessfulResponse(response, 'HEAD')
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

  async function fetchContentAndMetadata(subject: NamedNode): Promise<{ content: string, metadata: ResourceMetadata }> {
    const response = await store.fetcher.webOperation('GET', subject.uri)
    assertSuccessfulResponse(response, 'GET')
    const content = (response as Response & { responseText?: string }).responseText

    if (content === undefined) {
      throw new Error('No text in response object!!')
    }

    const resourceMetadata = readMetadata(subject, response)
    return { content, metadata: resourceMetadata }
  }

  function isNotFoundError(error: any): boolean {
    const status = error?.response?.status ?? error?.status
    if (status === 404 || status === 410) return true
    const text = `${error?.message || error || ''}`
    return text.includes('404') || text.includes('Not Found')
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

    let deleted
    try {
      deleted = await store.fetcher._fetch(resourceNode.value, { method: 'DELETE' })
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error
      }
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

  return {
    recursiveDelete,
    deleteResourceAndTypeIndexIfExists,
    fetchMetadata,
    fetchMetadataWithDelete,
    fetchContentAndMetadata,
    createContainer,
    isContainer,
    getContainerMemberCount
  }
}
