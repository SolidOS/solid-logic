import { beforeAll, describe, expect, it } from 'vitest'
import { presentSocial } from '../src/profile/sections/social/selectors'
import { sym, parse } from 'rdflib'
import { store } from '../src/index'

const subject = sym('https://janedoe.example/profile/card#me')
const doc = subject.doc()

describe('SocialPresenter', () => {
   beforeAll(async () => {
        store.removeDocument(doc)
        const turtle = `
        @prefix : <#>.
        @prefix foaf: <http://xmlns.com/foaf/0.1/> .
        @prefix vcard: <http://www.w3.org/2006/vcard/ns#> .
        @prefix solid: <http://www.w3.org/ns/solid/terms#>.
        @prefix foaf: <http://xmlns.com/foaf/0.1/>.
        @prefix soc: <https://solidos.github.io/profile-pane/src/ontology/socialMedia.ttl#>.
        @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#>.

        :me foaf:name "Jane Doe";
            foaf:img <https://janedoe.example/profile/me.jpg>;
            vcard:role "Test Double";
            vcard:organization-name "Solid Community";
            solid:preferredObjectPronoun "they";
            solid:preferredRelativePronoun "them";
            solid:preferredSubjectPronoun "their";
            vcard:hasAddress [
              vcard:locality "Hamburg";
              vcard:country-name "Germany";
            ];
            foaf:account
                ( :id1729675527480 :id1729912807298 :id1729912986863
                :id1730055928507 :id1730056067040 :id1730056125033 :id1730056175230
                :id1730056248989 :id1730058497607 :id1730059685809 :id1731874088097
                :id1732291980762 :id1732292364795 :id1732292968661 ),
                ( :id1729675527480 :id1729912807298 :id1729912986863
                :id1730055928507 :id1730056067040 :id1730056125033 :id1730056175230
                :id1730056248989 :id1730058497607 :id1730059685809 );
            .
        :id1729675527480 a soc:BlueSkyAccount; foaf:accountName "timbl.bsky.social".

      :id1729912807298 a soc:FacebookAccount; foaf:accountName "tim.bernerslee.9".

      :id1729912986863 a soc:InstagramAccount; foaf:accountName "timblee".

      :id1730055928507 a soc:MastodonAccount; foaf:accountName "@timbl@w3c.social".

      :id1730056067040 a soc:RedditAccount.

      :id1730056125033 a soc:RedditAccount; foaf:accountName "timbl".

      :id1730056175230 a soc:TwitterAccount; foaf:accountName "@timberners_lee".

      :id1730056248989
          a soc:OtherAccount;
          rdfs:label "My homepage at W3C";
          foaf:homepage <https://www.w3.org/>;
          foaf:icon <https://www.w3.org/assets/logos/w3c/w3c-bars.svg>.
      :id1730058497607 a soc:SnapchatAccount.

          :id1730059685809 a soc:TiktokAccount.

          :id1730387315524 a soc:GithubAccount; foaf:accountName "timbl".

          :id1730387353050
              a soc:MatrixAccount;
              foaf:accountName "@timbl-54d26c98db8155e6700f7312:gitter.im".
          :id1731874088097
          a soc:OtherAccount; rdfs:label "Strava"; foaf:homepage <htttps://strava.com/>.
          :id1732291980762 a soc:OrcidAccount; foaf:accountName "0000-0003-1279-3709".

          :id1732292364795 a soc:StravaAccount; foaf:accountName "12657979".

          :id1732292968661 a soc:TumblrAccount; foaf:accountName "w3cmemes".
    `
        parse(turtle, store, doc.uri)
    })

  it('returns an empty account list when no social accounts exist', () => {
    const jane = sym('https://example.com/no-social#me')
    const result = presentSocial(jane, store)
    expect(result).toEqual({ accounts: [] })
  })

  it('deduplicates accounts in presentSocial', () => {
    // Call presentSocial
    const result = presentSocial(subject, store)
    expect(result.accounts.length).toBe(10)
  })
})
