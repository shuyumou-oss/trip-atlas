import type { PoiCandidate } from './extractCandidates'
import type { PoiCategory } from '../plan/types'
export type AiCandidate = PoiCandidate & { category: PoiCategory; evidence: string }
export async function extractWithAi(text: string, cityName: string): Promise<AiCandidate[]> {
  const response = await fetch('/api/extract-pois', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, cityName }), signal: AbortSignal.timeout(25000),
  })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error || 'AI 识别暂时不可用。')
  return payload.candidates
}
