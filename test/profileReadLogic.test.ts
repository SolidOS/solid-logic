import { afterEach, describe, expect, it } from 'vitest'
import { blankNode, literal, st, sym } from 'rdflib'
import { solidLogicSingleton, store } from '../src'
import { ns } from '../src/util/ns'

const subject = sym('https://example.com/profile/card#me')
const document = subject.doc()

afterEach(() => {
  store.removeDocument(document)
})

describe('profile read API', () => {
  it('reads profile sections from the singleton store', () => {
    const email = blankNode('email')
    const phone = blankNode('phone')
    const address = blankNode('address')
    const education = blankNode('education')
    const skill = blankNode('skill')
    const customSkill = blankNode('custom-skill')

    store.add(st(subject, ns.vcard('note'), literal('Building accessible Solid apps.'), document))
    store.add(st(subject, ns.vcard('hasEmail'), email, document))
    store.add(st(email, ns.vcard('value'), sym('mailto:jane@example.com'), document))
    store.add(st(subject, ns.vcard('hasTelephone'), phone, document))
    store.add(st(phone, ns.vcard('value'), sym('tel:+15551234567'), document))
    store.add(st(subject, ns.vcard('hasAddress'), address, document))
    store.add(st(address, ns.vcard('locality'), literal('Boston'), document))
    store.add(st(education, ns.org('member'), subject, document))
    store.add(st(education, ns.rdf('type'), ns.schema('EducationalOccupationalCredential'), document))
    store.add(st(education, ns.schema('name'), literal('State University'), document))
    store.add(st(education, ns.schema('startDate'), literal('2020-09-01'), document))
    store.add(st(subject, ns.schema('skills'), skill, document))
    store.add(st(skill, ns.solid('publicId'), customSkill, document))
    store.add(st(customSkill, ns.schema('name'), literal('Facilitation'), document))
    store.add(st(subject, ns.schema('knowsLanguage'), sym('https://www.w3.org/ns/iana/language-code/en'), document))

    expect(solidLogicSingleton.profile.getBio(subject)).toEqual({
      description: 'Building accessible Solid apps.',
      sourceNode: subject
    })
    expect(solidLogicSingleton.profile.getContactInfo(subject).emails[0].valueNode.value).toBe('mailto:jane@example.com')
    expect(solidLogicSingleton.profile.getContactInfo(subject).phones[0].valueNode.value).toBe('tel:+15551234567')
    expect(solidLogicSingleton.profile.getContactInfo(subject).addresses[0].locality).toBe('Boston')
    expect(solidLogicSingleton.profile.getEducation(subject)).toEqual([
      expect.objectContaining({ school: 'State University', sourceNode: education })
    ])
    expect(solidLogicSingleton.profile.getSkillDetails(subject)).toEqual([
      expect.objectContaining({ name: 'Facilitation', publicId: '_:custom-skill', sourceNode: skill })
    ])
    expect(solidLogicSingleton.profile.getLanguages(subject)).toEqual([
      expect.objectContaining({ name: 'English' })
    ])
  })
})
