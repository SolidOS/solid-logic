import { NamedNode, sym, Util } from 'rdflib'
import { ACL_LINK } from '../acl/aclLogic'
import { ns } from '../util/ns'
import { assertSuccessfulHttpResponse, isMissingError } from './resourceHttp'
import { readWacAccessInfo } from './resourceMetadata'
import { ResourceUploadError, type ResourceAccess, type ResourceAccessWithDelete, type ResourceContent, type ResourceDeleteOptions, type ResourceLogic, type ResourceMetadata, type ResourceMetadataWithDelete, type ResourceUploadResult, type TypeIndexLogic } from '../types'
import type { AclLogic } from '../types'
import { createResourceCopyLogic } from './resourceCopy'
import * as mime from 'mime-types'
import * as debug from '../util/debug'

export function createResourceLogic(store, aclLogic: AclLogic, containerLogic, typeIndexLogic: TypeIndexLogic): ResourceLogic {
  const { copyResource, copyContainer } = createResourceCopyLogic(store, containerLogic)

  function uploadFiles (
    files: File[],
    destination: string
  ): Promise<ResourceUploadResult[]> {
    const getUploadError = (destUri: string | undefined, error: unknown) => {
      const uploadError = typeof error === 'object' && error !== null
        ? error as { response?: { status?: unknown }, status?: unknown, message?: unknown }
        : undefined
      const responseStatus = uploadError?.response?.status
      const directStatus = uploadError?.status
      const status = typeof responseStatus === 'number'
        ? responseStatus
        : typeof directStatus === 'number' ? directStatus : undefined
      const message = error instanceof Error
        ? error.message
        : typeof uploadError?.message === 'string'
          ? uploadError.message
          : typeof error === 'string' ? error : 'Upload failed'
      return new ResourceUploadError(message, destUri, status)
    }

    const upload = (file: File): Promise<ResourceUploadResult> => new Promise<ResourceUploadResult>(resolve => {
      const reader = new FileReader()
      reader.onload = event => {
        try {
          const data = event.target?.result
          if (!(data instanceof ArrayBuffer)) {
            resolve({ success: false, file, error: getUploadError(undefined, new Error('Unable to read file as an ArrayBuffer')) })
            return
          }

          let suffix = ''
          let contentType = file.type
          if (!contentType) {
            contentType = mime.lookup(file.name) || ''
            if (!contentType) {
              resolve({ success: false, file, error: getUploadError(undefined, new Error('Filename has no recognized content type')) })
              return
            }
          } else {
            const extension = mime.extension(file.type)
            if (extension && extension !== 'false' && !file.name.endsWith(`.${extension}`) && file.type !== mime.lookup(file.name)) {
              suffix = `_.${extension}`
            }
          }

          const destUri = `${destination}${destination.endsWith('/') ? '' : '/'}${encodeURIComponent(file.name)}${suffix}`

          store.fetcher.webOperation('PUT', destUri, { data, contentType }).then(
            response => resolve(response.ok
              ? { success: true, file, uploadedUri: destUri }
              : { success: false, file, error: new ResourceUploadError(`HTTP error on PUT! Status: ${response.status}`, destUri, response.status) }),
            error => resolve({ success: false, file, error: getUploadError(destUri, error) })
          )
        } catch (error) {
          resolve({ success: false, file, error: getUploadError(undefined, error) })
        }
      }
      reader.onerror = () => {
        resolve({ success: false, file, error: getUploadError(undefined, new Error('Unable to read file')) })
      }
      reader.onabort = () => {
        resolve({ success: false, file, error: getUploadError(undefined, new Error('File reading was aborted')) })
      }
      try {
        reader.readAsArrayBuffer(file)
      } catch (error) {
        resolve({ success: false, file, error: getUploadError(undefined, error) })
      }
    }).catch(error => ({
      success: false as const,
      file,
      error: getUploadError(undefined, error)
    }))

    return Promise.all(files.map(upload))
  }

  function createContainer(url: string) {
    return containerLogic.createContainer(url)
  }

  function isContainer(resourceNode: NamedNode) {
    return containerLogic.isContainer(resourceNode)
  }

  function getContainerMemberCount(resourceNode: NamedNode) {
    return containerLogic.getContainerMemberCount(resourceNode)
  }

  function getContainerMembers(resourceNode: NamedNode) {
    return containerLogic.getContainerElements(resourceNode)
  }

  function getContainerIndexThing(containerNode: NamedNode) {
    const folderUri = containerNode.uri.endsWith('/') ? containerNode.uri : `${containerNode.uri}/`
    return store.sym(`${folderUri}index.ttl#this`)
  }

  function containerHasIndexDocument(containerNode: NamedNode) {
    return store.holds(
      containerNode,
      ns.ldp('contains'),
      getContainerIndexThing(containerNode).doc()
    )
  }

  function isStorageRoot(resourceNode: NamedNode) {
    return store.holds(
      resourceNode,
      ns.rdf('type'),
      ns.space('Storage'),
      resourceNode.doc()
    )
  }

  function isHiddenFile(resourceNode: NamedNode) {
    const directory = resourceNode.dir()
    if (!directory) {
      return false
    }

    const pathEnd = resourceNode.uri.slice(directory.uri.length)
    return pathEnd.startsWith('.') || pathEnd.endsWith('.acl') || pathEnd.endsWith('.meta') || pathEnd.endsWith('~')
  }

  function isMediaType(resourceNode: NamedNode, mediaType: string) {
    const typeURIs = store.findTypeURIs(resourceNode as any)
    const normalizedMediaType = mediaType.toLowerCase()
    const mediaTypePrefix = Util.mediaTypeClass(`${normalizedMediaType}/*`).uri.split('*')[0]

    if (Object.keys(typeURIs).some(typeURI => typeURI.startsWith(mediaTypePrefix))) {
      return true
    }

    const mediaTypeClasses: Record<string, string> = {
      audio: 'http://purl.org/dc/dcmitype/Sound',
      image: 'http://purl.org/dc/dcmitype/Image',
      video: 'http://purl.org/dc/dcmitype/MovingImage'
    }
    if (mediaTypeClasses[normalizedMediaType] in typeURIs) {
      return true
    }

    const contentTypes = store.fetcher.getHeader(resourceNode, 'content-type') || []
    return contentTypes.some((contentType: string) =>
      contentType.split(';', 1)[0].trim().toLowerCase().startsWith(`${normalizedMediaType}/`)
    )
  }

  function isImage(resourceNode: NamedNode) {
    return isMediaType(resourceNode, 'image')
  }

  function isAudio(resourceNode: NamedNode) {
    return isMediaType(resourceNode, 'audio')
  }

  function isVideo(resourceNode: NamedNode) {
    return isMediaType(resourceNode, 'video')
  }

  function isWebId(resource: string | NamedNode) {
    const uri = typeof resource === 'string' ? resource : resource.value

    try {
      const parsed = new URL(uri)
      return parsed.hash === '#me' && /\/profile\/card\.ttl$/.test(parsed.pathname)
    } catch (_error) {
      return false
    }
  }

  function readMetadata(subject: NamedNode, response: Response): ResourceMetadata {
    let contentType: string | undefined
    let canEdit = false
    let canManageAccess = false
    let isPublic = false
    let isPublicKnown = false
    let eTag: string | undefined
    let modified: string | undefined

    if (response.headers) {
      const contentTypeHeader = response.headers.get('content-type')
      contentType = contentTypeHeader?.split(';')[0] ?? undefined

      const accessFlags = readWacAccessInfo(response.headers.get('wac-allow'))
      canEdit = accessFlags.canEdit
      canManageAccess = accessFlags.canManageAccess
      isPublic = accessFlags.isPublic
      isPublicKnown = accessFlags.isPublicKnown
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
          canManageAccess = canManageAccess || accessFlags.canManageAccess
          isPublic = isPublic || accessFlags.isPublic
          isPublicKnown = isPublicKnown || accessFlags.isPublicKnown
          const responseETag = store.anyValue(responseNode as any, ns.httph('etag')) || undefined
          if (eTag === undefined) {
            eTag = responseETag
          }
          modified = store.anyValue(subject as any, ns.dct('modified')) || store.anyValue(subject as any, ns.dc('modified')) || undefined
        }
      })
    }

    const aclUri = store.any(subject, ACL_LINK)?.value || undefined
    const access: ResourceAccess = { canEdit, canManageAccess, isPublic, isPublicKnown }
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

  async function fetchContentAndMetadata(subject: NamedNode): Promise<ResourceContent> {
    try {
      const response = await store.fetcher.webOperation('GET', subject.uri)
      assertSuccessfulHttpResponse(response, 'GET')

      const content = (response as Response & { responseText?: string }).responseText
      if (content === undefined) {
        throw new Error('No text in response object')
      }

      const metadata = readMetadata(subject, response)
      if (!metadata.contentType) {
        throw new Error('No content-type available')
      }

      return { content, metadata }
    } catch (error) {
      throw new Error(`Error reading file: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async function fetchMetadataWithDelete(subject: NamedNode): Promise<ResourceMetadataWithDelete> {
    let resourceMetadata: ResourceMetadata

    try {
      resourceMetadata = await fetchHeadMetadata(subject)
    } catch (_error) {
      resourceMetadata = {
        contentType: undefined,
        access: { canEdit: false, canManageAccess: false, isPublic: false },
        aclUri: undefined,
        eTag: undefined,
        modified: undefined
      }
    }

    const canDelete = await userCanDeleteResource(subject)
    const access: ResourceAccessWithDelete = {
      canEdit: resourceMetadata.access?.canEdit ?? false,
      canManageAccess: resourceMetadata.access?.canManageAccess ?? false,
      isPublic: resourceMetadata.access?.isPublic ?? false,
      isPublicKnown: resourceMetadata.access?.isPublicKnown ?? false,
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
      store.removeMatches(resourceParent, ns.ldp('contains'), resourceNode)
    }

    store.removeDocument(resourceNode)
    store.fetcher.unload(resourceNode.doc())
    debug.log(`Deleted resource: ${resourceNode.value}`)
    return deleted
  }

  async function deleteResourceAndTypeIndexIfExists(resourceNode: NamedNode, user?: NamedNode | null) {
    await recursiveDelete(resourceNode, { deleteTypeIndexes: true, user })
  }

  return {
    uploadFiles,
    copyResource,
    copyContainer,
    recursiveDelete,
    deleteResourceAndTypeIndexIfExists,
    fetchMetadata,
    fetchMetadataWithDelete,
    fetchContentAndMetadata,
    createContainer,
    isContainer,
    getContainerMembers,
    getContainerMemberCount,
    getContainerIndexThing,
    containerHasIndexDocument,
    isStorageRoot,
    isHiddenFile,
    isMediaType,
    isImage,
    isAudio,
    isVideo,
    isWebId
  }
}
