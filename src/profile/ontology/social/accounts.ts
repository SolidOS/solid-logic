export type SocialAccountOntology = {
  classUri: string
  label: string
  icon?: string
  homepage?: string
  userProfilePrefix?: string
}

const socialMediaOntology = 'https://solidos.github.io/profile-pane/src/ontology/socialMedia.ttl#'

function account (
  name: string,
  label: string,
  icon?: string,
  homepage?: string,
  userProfilePrefix?: string
): SocialAccountOntology {
  return {
    classUri: `${socialMediaOntology}${name}`,
    label,
    icon,
    homepage,
    userProfilePrefix
  }
}

export const socialAccountOntologies: readonly SocialAccountOntology[] = [
  account('BlueSkyAccount', 'Bluesky', 'https://solidos.github.io/solid-ui/src/icons/social/bluesky-1.svg', 'https://bsky.app/', 'https://bsky.app/profile/'),
  account('DribbleAccount', 'Dribble', 'urn:profile-pane:icon:dribbble', 'https://dribbble.com/', 'https://dribbble.com/'),
  account('DiscordAccount', 'Discord', 'urn:profile-pane:icon:discord', 'https://discord.com/', 'https://discord.com/users/'),
  account('DiggAccount', 'Digg', 'https://solidos.github.io/solid-ui/src/icons/social/digg-icon.svg', 'https://www.digg.com/', 'https://www.digg.com/'),
  account('FacebookAccount', 'Facebook', 'urn:profile-pane:icon:facebook', 'https://www.facebook.com/', 'https://www.facebook.com/'),
  account('GithubAccount', 'Github', 'https://solidos.github.io/solid-ui/src/icons/social/github-icon.svg', 'https://github.com/', 'https://www.github.com/'),
  account('InstagramAccount', 'Instagram', 'urn:profile-pane:icon:instagram', 'https://www.instagram.com/', 'https://www.instagram.com/'),
  account('LinkedInAccount', 'LinkedIn', 'urn:profile-pane:icon:linkedin', 'https://linkedin.com/', 'https://www.linkedin.com/in/'),
  account('MastodonAccount', 'Mastodon', 'https://solidos.github.io/solid-ui/src/icons/social/mastodon-2.svg', 'https://joinmastodon.org/', 'https://mastodon.social/'),
  account('MatrixAccount', 'Matrix', 'https://solidos.github.io/solid-ui/src/icons/social/matrix-logo-black.svg', 'https://matrix.org/', 'https://matrix.to/#/'),
  account('MediumAccount', 'Medium', 'https://solidos.github.io/solid-ui/src/icons/social/medium-logo-wordmark-black.svg', 'https://medium.com/', 'https://medium.com/'),
  account('NostrAccount', 'Nostr', 'https://solidos.github.io/solid-ui/src/icons/social/nostr-icon-purple-on-white.svg', 'https://nostr.net/', 'https://primal.net/p/'),
  account('OrcidAccount', 'ORCiD', 'https://solidos.github.io/solid-ui/src/icons/social/ORCID-1.svg', 'https://orcid.org/', 'https://orcid.org/'),
  account('PinterestAccount', 'Pinterest', 'urn:profile-pane:icon:pinterest', 'https://pinterest.com/', 'https://pin.it/'),
  account('RedditAccount', 'Reddit', 'https://solidos.github.io/solid-ui/src/icons/social/reddit-4.svg', 'https://reddit.com/', 'https://www.reddit.com/user/'),
  account('SharechatAccount', 'ShareChat', 'urn:profile-pane:icon:sharechat', 'https://sharechat.com/', 'https://www.sharechat.com/user/'),
  account('SnapchatAccount', 'Snapchat', 'urn:profile-pane:icon:snapchat', 'https://www.snapchat.com/', 'https://www.snapchat.com/add/'),
  account('SpotifyAccount', 'Spotify', 'urn:profile-pane:icon:spotify', 'https://www.spotify.com/', 'https://www.spotify.com/user/'),
  account('StravaAccount', 'Strava', 'https://solidos.github.io/solid-ui/src/icons/social/strava-2.svg', 'https://strava.com/', 'https://www.strava.com/athletes/'),
  account('TelegramAccount', 'Telegram', 'urn:profile-pane:icon:telegram', 'https://telegram.org/', 'https://t.me/'),
  account('TiktokAccount', 'TikTok', 'urn:profile-pane:icon:tiktok', 'https://www.tiktok.com/', 'https://www.tiktok.com/@'),
  account('TumblrAccount', 'Tumblr', 'https://solidos.github.io/solid-ui/src/icons/social/tumblr-icon.svg', 'https://www.tumblr.com/', 'https://www.tumblr.com/'),
  account('TwitterAccount', 'X', 'urn:profile-pane:icon:x', 'https://x.com/', 'https://x.com/'),
  account('WhatsAppAccount', 'WhatsApp', 'urn:profile-pane:icon:whatsapp', 'https://www.whatsapp.com/', 'https://wa.me/'),
  account('YouTubeAccount', 'YouTube', 'urn:profile-pane:icon:youtube', 'https://www.youtube.com/', 'https://www.youtube.com/'),
  account('OtherAccount', 'Other', 'urn:profile-pane:starIcon')
]

const socialAccountOntologyByClassUri = new Map(
  socialAccountOntologies.map(ontology => [ontology.classUri, ontology])
)

export function socialAccountOntologyFor (classUri: string): SocialAccountOntology | undefined {
  return socialAccountOntologyByClassUri.get(classUri)
}
