export const web: Record<string, string> = {}
export const requests: Request[] = []

export async function mockFetchFunction (req: Request) {
  requests.push(req)

  if (req.method === 'PUT') {
    const contents = await req.text()
    web[req.url] = contents
    return { status: 200 }
  }

  if (req.method !== 'GET') {
    return { status: 200 }
  }

  const contents = web[req.url]
  if (contents !== undefined) {
    return {
      body: contents,
      status: 200,
      headers: {
        'Content-Type': 'text/turtle'
      }
    }
  }

  return {
    status: 404,
    body: 'Not Found'
  }
}