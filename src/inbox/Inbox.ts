import { LiveStore, NamedNode } from "rdflib";
import { Profile } from "../profile/Profile";
import { SolidNamespace } from "../types";
import { Container } from "../util/Container";
import { getArchiveUrl } from "../util/utils";

/**
 * Inbox-related logic
 */
export class Inbox {
  store: LiveStore;
  ns: SolidNamespace;
  profile: Profile;
  container: Container;

  constructor(store: LiveStore, ns: SolidNamespace, profile: Profile, container) {
    this.store = store;
    this.ns = ns;
    this.profile = profile;
    this.container = container;
  }

  async getNewMessages(
    user?: NamedNode
  ): Promise<string[]> {
    if (!user) {
      user = await this.profile.loadMe();
    }
    const inbox = await this.profile.getMainInbox(user);
    const urls = await this.container.getContainerMembers(inbox.value);
    return urls.filter(url => !this.container.isContainer(url));
  }

  async markAsRead(url: string, date: Date) {
    const downloaded = await this.store.fetcher._fetch(url);
    if (downloaded.status !== 200) {
      throw new Error(`Not OK! ${url}`);
    }
    const archiveUrl = getArchiveUrl(url, date);
    const options =  {
      method: 'PUT',
      body: await downloaded.text(),
      headers: [
        [ 'Content-Type', downloaded.headers.get('Content-Type') || 'application/octet-stream' ]
      ]
    };
    const uploaded = await this.store.fetcher._fetch(archiveUrl, options);
    if (uploaded.status.toString()[0] === '2') {
      await this.store.fetcher._fetch(url, {
        method: 'DELETE'
      });
    }
  }
}
