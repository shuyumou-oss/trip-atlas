export type MapPoiCandidate = {
  mapPoiId: string
  name: string
  address: string
  district: string
  longitude: number
  latitude: number
}

type SearchResponse = {
  results?: MapPoiCandidate[]
  error?: string
}

export async function searchMapPois(name: string, cityAdcode: string): Promise<MapPoiCandidate[]> {
  const response = await fetch('/api/poi-search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, cityAdcode }),
    signal: AbortSignal.timeout(25000),
  })
  const payload = await response.json() as SearchResponse
  if (!response.ok) throw new Error(payload.error || '地点搜索暂时不可用，请稍后重试。')
  return payload.results ?? []
}
