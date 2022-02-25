import {
  Session,
  getClientAuthenticationWithDependencies
} from '@inrupt/solid-client-authn-browser'

export const authSession = new Session(
    {
      clientAuthentication: getClientAuthenticationWithDependencies({})
    },
    'mySession'
  )

  