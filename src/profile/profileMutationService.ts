import { NamedNode, LiveStore } from 'rdflib'
import { NotEditableError } from '../logic/CustomError'
import type { ProfileMutationService } from '../types'
import { processBioMutations } from './sections/bio/mutations'
import { processContactInfoMutations } from './sections/contactInfo/mutations'
import { processEducationMutations } from './sections/education/mutations'
import { processHeadingMutations } from './sections/heading/mutations'
import { processLanguageMutations } from './sections/languages/mutations'
import { processProjectsMutations } from './sections/projects/mutations'
import { processResumeMutations } from './sections/resume/mutations'
import { processSkillsMutations } from './sections/skills/mutations'
import { processSocialMutations } from './sections/social/mutations'
import type { HeadingMutationPlan } from './sections/heading/types'
import type { BioMutationPlan } from './sections/bio/types'
import type { ContactMutationPlan } from './sections/contactInfo/types'
import type { EducationMutationPlan } from './sections/education/types'
import type { LanguageMutationPlan } from './sections/languages/mutations'
import type { LanguageRow } from './sections/languages/types'
import type { ProjectMutationPlan } from './sections/projects/types'
import type { ResumeMutationPlan } from './sections/resume/mutations'
import type { SkillMutationPlan } from './sections/skills/mutations'
import type { SocialMutationPlan, SocialRow } from './sections/social/types'

export function createProfileMutationService (store: LiveStore): ProfileMutationService {
  async function prepareProfileDocument (doc: NamedNode): Promise<void> {
    await store.fetcher.load(doc, { force: true })
    if (!store.updater.editable(doc)) {
      throw new NotEditableError(`Cannot edit profile document ${doc.value}`)
    }
  }

  async function runProfileSectionMutation<Args extends unknown[]>(
    subject: NamedNode,
    mutation: (store: LiveStore, subject: NamedNode, ...args: Args) => Promise<void>,
    ...args: Args
  ): Promise<void> {
    await prepareProfileDocument(subject.doc())
    await mutation(store, subject, ...args)
  }

  return {
    processHeadingMutations: (subject: NamedNode, plan: HeadingMutationPlan) =>
      runProfileSectionMutation(subject, processHeadingMutations, plan),
    processContactInfoMutations: (subject: NamedNode, plan: ContactMutationPlan) =>
      runProfileSectionMutation(subject, processContactInfoMutations, plan),
    processBioMutations: (subject: NamedNode, plan: BioMutationPlan) =>
      runProfileSectionMutation(subject, processBioMutations, plan),
    processEducationMutations: (subject: NamedNode, plan: EducationMutationPlan) =>
      runProfileSectionMutation(subject, processEducationMutations, plan),
    processLanguageMutations: (subject: NamedNode, plan: LanguageMutationPlan, orderedRows?: LanguageRow[]) =>
      runProfileSectionMutation(subject, processLanguageMutations, plan, orderedRows),
    processProjectsMutations: (subject: NamedNode, plan: ProjectMutationPlan) =>
      runProfileSectionMutation(subject, processProjectsMutations, plan),
    processResumeMutations: (subject: NamedNode, plan: ResumeMutationPlan) =>
      runProfileSectionMutation(subject, processResumeMutations, plan),
    processSkillsMutations: (subject: NamedNode, plan: SkillMutationPlan) =>
      runProfileSectionMutation(subject, processSkillsMutations, plan),
    processSocialMutations: (subject: NamedNode, plan: SocialMutationPlan, orderedRows?: SocialRow[]) =>
      runProfileSectionMutation(subject, processSocialMutations, plan, orderedRows)
  }
}

export type { ProfileMutationService }
