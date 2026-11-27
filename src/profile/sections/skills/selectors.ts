import { LiveStore, NamedNode } from 'rdflib'
import { labelForNode } from '../../../directory/directoryHelpers'
import { ns } from '../../../util/ns'
import { isNamedOrBlankNode } from '../shared/rdfMutationHelpers'
import type { RdfResourceNode } from '../shared/types'
import type { SkillDetails } from './types'

export function skillAsText (store: LiveStore, skill: RdfResourceNode): string {
  const directName = store.anyJS(skill, ns.schema('name'))
  if (directName) return directName

  const publicId = store.any(skill, ns.solid('publicId'))
  if (isNamedOrBlankNode(publicId)) {
    const name = store.anyJS(publicId, ns.schema('name'))
    if (name) return name
    if (publicId.termType === 'NamedNode') return labelForNode(store, publicId)
  }
  return ''
}

export function getSkillDetails (subject: NamedNode, store: LiveStore): SkillDetails[] {
  return store
    .each(subject, ns.schema('skills'))
    .filter(isNamedOrBlankNode)
    .map((sourceNode) => {
      const publicId = store.any(sourceNode, ns.solid('publicId'))
      return {
        name: skillAsText(store, sourceNode),
        publicId: isNamedOrBlankNode(publicId)
          ? publicId.termType === 'BlankNode' ? `_:${publicId.value}` : publicId.value
          : '',
        sourceNode
      }
    })
    .filter((detail) => detail.name !== '')
}

export function getSkills (subject: NamedNode, store: LiveStore): string[] {
  return getSkillDetails(subject, store).map((detail) => detail.name)
}
