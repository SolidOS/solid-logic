import { sym } from 'rdflib'

//------ Club -------------------------------------------------------
const club = sym('https://club.example.com/profile/card.ttl#it')
const ClubPreferencesFile = sym('https://club.example.com/settings/prefs.ttl')
const ClubPublicTypeIndex = sym('https://club.example.com/profile/public-type-index.ttl')
const ClubPrivateTypeIndex = sym('https://club.example.com/settings/private-type-index.ttl')

const ClubProfile = `

<#it> a vcard:Organization;
    space:preferencesFile ${ClubPreferencesFile};
    solid:publicTypeIndex ${ClubPublicTypeIndex};
    vcard:fn "Card Club" .
`
const ClubPreferences =  `
    ${club} solid:privateTypeIndex ${ClubPrivateTypeIndex} .
`
const ClubPublicTypes = `

:chat1 solid:forClass meeting:LongChat; solid:instance <../publicStuff/ourChat.ttl#this> .

:todo solid:forClass wf:Tracker; solid:instance  <../publicStuff/actionItems.ttl#this>.

:issues solid:forClass wf:Tracker; solid:instance  <../project4/clubIssues.ttl#this>.
`;

const ClubPrivateTypes = `
:id1592319218311 solid:forClass wf:Tracker; solid:instance  <../privateStuff/ToDo.ttl#this>.

:id1592319391415 solid:forClass wf:Tracker; solid:instance <../privateStuff/Goals.ttl#this>.

:id1595595377864 solid:forClass wf:Tracker; solid:instance <../privateStuff/tasks.ttl#this>.

:id1596123375929 solid:forClass meeting:Meeting; solid:instance  <../project4/clubMeeting.ttl#this>.

`;

//------ Alice -------------------------------------------------------
const alice = sym("https://alice.example.com/profile/card.ttl#me")
const AliceProfileFile = alice.doc()
const AlicePreferencesFile = sym('https://alice.example.com/settings/prefs.ttl')
const AlicePublicTypeIndex = sym('https://alice.example.com/profile/public-type-index.ttl')
const AlicePrivateTypeIndex = sym('https://alice.example.com/settings/private-type-index.ttl')
const AlicePhotoFolder = sym(alice.dir().uri + "Photos/")
const AliceProfile = `
<#me> a vcard:Individual;
    space:preferencesFile ${AlicePreferencesFile};
    solid:publicTypeIndex ${AlicePublicTypeIndex};
    vcard:fn "Alice" .
`
const AlicePreferences =  `
    ${alice} solid:privateTypeIndex ${AlicePrivateTypeIndex};
    solid:community ${club} .
`
const AlicePublicTypes = `

:chat1 solid:forClass meeting:LongChat; solid:instance <../publicStuff/myChat.ttl#this> .

:todo solid:forClass wf:Tracker; solid:instance  <../publicStuff/actionItems.ttl#this>.

:issues solid:forClass wf:Tracker; solid:instance  <../project4/issues.ttl#this>.

:photos solid:forClass schema:Image; solid:instanceContainer  ${AlicePhotoFolder} .
# :bookmarks
#    a solid:TypeRegistration;
#    solid:forClass bookm:Bookmark;
#    solid:instance </public/poddit.ttl>.
`;

const AlicePrivateTypes = `
:id1592319218311 solid:forClass wf:Tracker; solid:instance  <../privateStuff/ToDo.ttl#this>.

:id1592319391415 solid:forClass wf:Tracker; solid:instance <../privateStuff/Goals.ttl#this>.

:id1595595377864 solid:forClass wf:Tracker; solid:instance <../privateStuff/workingOn.ttl#this>.

:id1596123375929 solid:forClass meeting:Meeting; solid:instance  <../project4/meeting1.ttl#this>.

`;

const AlicePhotos = `
<>
    a ldp:BasicContainer, ldp:Container;
    dct:modified "2021-04-26T05:34:16Z"^^xsd:dateTime;
    ldp:contains
        <photo1.png>, <photo2.png>, <photo3.png> ;
    stat:mtime 1619415256.541;
    stat:size 4096 .
`

//------ Bob -------------------------------------------------------
const bob = sym('https://bob.example.com/profile/card.ttl#me')

const BobProfile = `
<#me> a vcard:Individual;
vcard:fn "Bob" .
`

export {
    alice, bob, club,
    AlicePhotoFolder, AlicePreferences, AlicePhotos, AlicePreferencesFile, AlicePrivateTypeIndex, AlicePrivateTypes, AliceProfile, AliceProfileFile, AlicePublicTypeIndex, AlicePublicTypes,
    BobProfile,
    ClubPreferences, ClubPreferencesFile, ClubPrivateTypeIndex, ClubPrivateTypes, ClubProfile, ClubPublicTypeIndex, ClubPublicTypes
}