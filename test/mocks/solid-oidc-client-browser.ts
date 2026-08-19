type Listener = (...args: any[]) => void

class EventEmitterLike {
  private listeners: Record<string, Listener[]> = {}

  on(event: string, listener: Listener): void {
    const list = this.listeners[event] || []
    list.push(listener)
    this.listeners[event] = list
  }

  emit(event: string, ...args: any[]): void {
    const list = this.listeners[event] || []
    list.forEach(listener => listener(...args))
  }
}

export class Session {
  info: { webId?: string, isLoggedIn: boolean } = { isLoggedIn: false }
  webId?: string
  isActive = false
  events = new EventEmitterLike()

  async handleIncomingRedirect(): Promise<void> {
    return
  }

  async handleRedirectFromLogin(): Promise<void> {
    return
  }

  async restore(): Promise<void> {
    return
  }

  async login(): Promise<void> {
    return
  }

  async logout(): Promise<void> {
    this.info = { isLoggedIn: false }
    this.webId = undefined
    this.isActive = false
  }

  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    return globalThis.fetch(input, init)
  }

  authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    return globalThis.fetch(input, init)
  }
}

export class SessionCore extends Session {
  constructor(_clientDetails?: unknown, _sessionOptions?: unknown) {
    super()
  }
}

export class SessionIDB {
  async init(): Promise<SessionIDB> {
    return this
  }

  async setItem(_id: string, _value: any): Promise<void> {
    return
  }

  async getItem(_id: string): Promise<any> {
    return null
  }

  async deleteItem(_id: string): Promise<void> {
    return
  }

  async clear(): Promise<void> {
    return
  }

  close(): void {
    return
  }
}
