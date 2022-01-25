import { NamedNode, sym } from "rdflib"
import * as debug from './debug'

/**
 * find a user or app's context as set in window.SolidAppContext
 * export for test only
 * this is a const, not a function, because we have problems to jest mock it otherwise
 * see: https://github.com/facebook/jest/issues/936#issuecomment-545080082 for more
 * @return {any} - an appContext object
 */
 export const appContext = ():any => {
    let { SolidAppContext }: any = window
    SolidAppContext ||= {}
    SolidAppContext.viewingNoAuthPage = false
    if (SolidAppContext.noAuth && window.document) {
        const currentPage = window.document.location.href
        if (currentPage.startsWith(SolidAppContext.noAuth)) {
        SolidAppContext.viewingNoAuthPage = true
        const params = new URLSearchParams(window.document.location.search)
        if (params) {
            let viewedPage = SolidAppContext.viewedPage = params.get('uri') || null
            if (viewedPage) {
            viewedPage = decodeURI(viewedPage)
            if (!viewedPage.startsWith(SolidAppContext.noAuth)) {
                const ary = viewedPage.split(/\//)
                SolidAppContext.idp = ary[0] + '//' + ary[2]
                SolidAppContext.viewingNoAuthPage = false
            }
            }
        }
        }
    }
    return SolidAppContext
}

/**
 * Returns `sym($SolidTestEnvironment.username)` if
 * `$SolidTestEnvironment.username` is defined as a global
 * or 
 * returns testID defined in the HTML page
 * @returns {NamedNode|null}
 */
 export function offlineTestID (): NamedNode | null {
    const { $SolidTestEnvironment }: any = window
    if (
      typeof $SolidTestEnvironment !== 'undefined' &&
      $SolidTestEnvironment.username
    ) {
      // Test setup
      debug.log('Assuming the user is ' + $SolidTestEnvironment.username)
      return sym($SolidTestEnvironment.username)
    }
    // hack that makes SolidOS work in offline mode by adding the webId directly in html
    // example usage: https://github.com/solid/mashlib/blob/29b8b53c46bf02e0e219f0bacd51b0e9951001dd/test/contact/local.html#L37
    if (
      typeof document !== 'undefined' &&
       document.location &&
       ('' + document.location).slice(0, 16) === 'http://localhost'
    ) {
      const div = document.getElementById('appTarget')
      if (!div) return null
      const id = div.getAttribute('testID')
      if (!id) return null
      debug.log('Assuming user is ' + id)
      return sym(id)
    }
    return null
}

  /**
 * Look for and load the User who has control over it
 */
export function findOriginOwner (doc: NamedNode | string): string | boolean {
    const uri = (typeof doc === 'string') ? doc : doc.uri
    const i = uri.indexOf('://')
    if (i < 0) return false
    const j = uri.indexOf('/', i + 3)
    if (j < 0) return false
    const origin = uri.slice(0, j + 1) // @@ TBC
    return origin
 }