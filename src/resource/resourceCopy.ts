import { NamedNode, sym } from 'rdflib'
import type { ResourceCopyOptions } from '../types'
import { assertSuccessfulHttpResponse } from './resourceHttp'

export function createResourceCopyLogic (store, containerLogic) {
  const isSafeCreationName = (value: string): boolean =>
     value.length > 0 &&
      value.trim().length > 0 &&
      value !== '.' &&
      value !== '..' &&
      !/[\/\\\u0000-\u001f\u007f]/.test(value)

  function resourceName (resource: NamedNode): string {
    const url = new URL(resource.value)
    const segments = url.pathname.split('/').filter(Boolean)
    const name = decodeURIComponent(segments[segments.length - 1] || '')
    if (!isSafeCreationName(name)) throw new Error('The resource URL does not contain a valid name.')
    return name
  }

  function copyUrl (value: string): URL {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Only HTTP(S) resource URLs can be copied.')
    if (url.search || url.hash || url.username || url.password) {
      throw new Error('Copy URLs must not contain a query, fragment, or credentials.')
    }
    return url
  }

  function childUrl (parent: string, name: string, isContainer = false): string {
    return `${parent}${encodeURIComponent(name)}${isContainer ? '/' : ''}`
  }

  // Use _fetch here so a 412 can be handled as a collision and binary content
  // can be passed through unchanged; webOperation rejects non-2xx responses.
  async function putResource (
    target: string,
    response: Response | undefined,
    body: ArrayBuffer | undefined,
    condition: Record<string, string>
  ): Promise<Response> {
    return store.fetcher._fetch(target, {
      method: 'PUT',
      headers: {
        'Content-Type': response?.headers.get('content-type') || 'application/octet-stream',
        ...condition
      },
      body
    })
  }

  async function recreateContainerAcl (sourceUrl: URL, target: string, members: NamedNode[]): Promise<void> {
    const sourceAclUrl = new URL('.acl', sourceUrl.href).href
    const sourceAcl = await store.fetcher._fetch(sourceAclUrl)
    if (sourceAcl.status === 404) return
    assertSuccessfulHttpResponse(sourceAcl, `GET ${sourceAclUrl}`)
    const sourceAclText = await sourceAcl.text()
    const targetAclUrl = new URL('.acl', target).href
    const created = await store.fetcher._fetch(targetAclUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': sourceAcl.headers.get('content-type') || 'text/turtle',
        'If-None-Match': '*'
      },
      body: sourceAclText.replaceAll(sourceUrl.href, target)
    })
    assertSuccessfulHttpResponse(created, `PUT ${targetAclUrl}`)
  }

  async function copyResourceNode (
    resource: NamedNode,
    parent: string,
    options: ResourceCopyOptions,
    written: string[],
    isRoot = false
  ): Promise<string | undefined> {
    const sourceUrl = copyUrl(resource.value)
    const folder = containerLogic.isContainer(resource)
    if (folder && !sourceUrl.pathname.endsWith('/')) sourceUrl.pathname += '/'
    if (folder && (parent === sourceUrl.href || parent.startsWith(sourceUrl.href))) {
      throw new Error('A folder cannot be copied into itself or one of its descendants.')
    }

    const name = resourceName(sym(sourceUrl.href))
    let target = childUrl(parent, name, folder)
    if (target === sourceUrl.href) throw new Error('A resource cannot be copied onto itself.')
    const members: NamedNode[] = folder ? await containerLogic.getContainerMembers(resource) : []
    const sourceAclUrl = new URL('.acl', sourceUrl.href).href
    const copyMembers = members.filter(member => member.value !== sourceAclUrl)
    for (const member of members) {
      const memberUrl = copyUrl(member.value)
      const relative = memberUrl.href.slice(sourceUrl.href.length).replace(/\/$/, '')
      if (!memberUrl.href.startsWith(sourceUrl.href) || !relative || relative.includes('/')) {
        throw new Error(`Invalid container member ${member.value} in ${sourceUrl.href}`)
      }
    }
    const response: Response | undefined = folder ? undefined : await store.fetcher._fetch(sourceUrl.href)
    if (response) assertSuccessfulHttpResponse(response, `GET ${sourceUrl.href}`)
    const body = await response?.arrayBuffer()
    return copyResourceWithCollisionHandling({
      sourceUrl,
      parent,
      name,
      target,
      folder,
      members: copyMembers,
      response,
      body,
      onCollision: isRoot ? options.onCollision : undefined,
      written
    })
  }

  async function copyResourceWithCollisionHandling ({
    sourceUrl,
    parent,
    name,
    target,
    folder,
    members,
    response,
    body,
    onCollision,
    written
  }: {
    sourceUrl: URL
    parent: string
    name: string
    target: string
    folder: boolean
    members: NamedNode[]
    response?: Response
    body?: ArrayBuffer
    onCollision?: ResourceCopyOptions['onCollision']
    written: string[]
  }): Promise<string | undefined> {
    let condition: Record<string, string> = { 'If-None-Match': '*' }
    let collision = false
    let targetRecorded = false
    if (folder) {
      try {
        await containerLogic.createContainer(target, { allowExisting: false })
      } catch (error) {
        const status = typeof error === 'object' && error !== null && 'status' in error ? error.status : undefined
        if (status !== 409 && status !== 412) throw error
        collision = true
      }
    } else {
      const created = await putResource(target, response, body, condition)
      collision = created.status === 412
      if (!collision) assertSuccessfulHttpResponse(created, `PUT ${target}`)
    }
    if (!collision && folder) {
      written.push(target)
      targetRecorded = true
    }
    if (collision) {
      const choice = await onCollision?.({
        source: sourceUrl.href, destination: target, isContainer: folder
      })
      if (!choice) throw new Error(`A resource already exists at ${target}`)
      if (choice === 'cancel') return undefined
      if (choice === 'replace') {
        if (folder) throw new Error('Replacing or merging existing folders is not supported. Choose Keep both instead.')
        const existing: Response = await store.fetcher._fetch(target, { method: 'HEAD' })
        assertSuccessfulHttpResponse(existing, `HEAD ${target}`)
        const etag = existing.headers.get('etag')
        if (!etag || etag.startsWith('W/')) throw new Error(`Cannot safely replace ${target}: the server did not provide a strong ETag.`)
        condition = { 'If-Match': etag }
      } else {
        const dot = folder ? -1 : name.lastIndexOf('.')
        const stem = dot > 0 ? name.slice(0, dot) : name
        const extension = dot > 0 ? name.slice(dot) : ''
        target = childUrl(parent, `${stem}-copy-${crypto.randomUUID()}${extension}`, folder)
      }

      if (folder) {
        await containerLogic.createContainer(target, { allowExisting: false })
        written.push(target)
        targetRecorded = true
      } else {
        const created = await putResource(target, response, body, condition)
        assertSuccessfulHttpResponse(created, `PUT ${target}`)
      }
    }

    if (!targetRecorded) written.push(target)
    for (const member of new Map(members.map(member => [member.value, member])).values()) {
      await copyResourceNode(member, target, {}, written)
    }
    if (folder && targetRecorded) await recreateContainerAcl(sourceUrl, target, members)
    return target
  }

  async function copyTopLevel (
    source: NamedNode,
    destination: string | NamedNode,
    options: ResourceCopyOptions,
    expectedContainer: boolean
  ): Promise<string | undefined> {
    if (containerLogic.isContainer(source) !== expectedContainer) {
      const kind = expectedContainer ? 'container' : 'resource'
      throw new Error(`Cannot copy ${source.value} as a ${kind}.`)
    }
    const destinationUrl = copyUrl(typeof destination === 'string' ? destination : destination.value)
    if (!destinationUrl.pathname.endsWith('/')) destinationUrl.pathname += '/'
    const written: string[] = []
    try {
      return await copyResourceNode(source, destinationUrl.href, options, written, true)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      const partial = written.length
        ? ` Copy is incomplete; ${written.length} destination resource(s) were written and remain at ${written[0]}.`
        : ''
      throw new Error(`Copy from ${source.value} to ${destinationUrl.href} failed: ${detail}${partial}`)
    }
  }

  async function copyResource (source: NamedNode, destination: string | NamedNode, options: ResourceCopyOptions = {}) {
    return copyTopLevel(source, destination, options, false)
  }

  async function copyContainer (source: NamedNode, destination: string | NamedNode, options: ResourceCopyOptions = {}) {
    return copyTopLevel(source, destination, options, true)
  }

  return { copyResource, copyContainer }
}
