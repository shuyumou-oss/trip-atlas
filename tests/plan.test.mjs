import test from 'node:test'
import assert from 'node:assert/strict'
globalThis.window = { location: { search: '' }, localStorage: { getItem: () => null, setItem: () => {} } }
const { planReducer } = await import('../src/features/plan/PlanProvider.tsx')
const { emptyPlan } = await import('../src/features/plan/seed.ts')
const { extractPoiCandidates } = await import('../src/features/import/extractCandidates.ts')
const { loadPlan, isTravelPlan } = await import('../src/features/plan/storage.ts')
const source = { title: '攻略', url: null, importedAt: '2026-10-12', method: 'text' }
const seed = () => planReducer(structuredClone(emptyPlan), { type: 'confirm-imported-pois', candidates: [{ name: '西湖', category: '景点' }, { name: '灵隐寺', category: '景点' }, { name: '凤起路站', category: '交通', transportType: '地铁站' }], source })
test('手动重复导入合并地点，保留来源', () => {
  const p = seed()
  const next = planReducer(p, { type: 'confirm-imported-pois', candidates: [{ name: '西湖', category: '景点' }], source: { ...source, title: '第二篇' } })
  assert.equal(next.pois.length, 3)
  assert.equal(next.pois[0].sources.length, 2)
})
test('必去与日期独立，减少天数只清日期', () => {
  let p = seed()
  p = planReducer(p, { type: 'set-poi-arrangement', poiId: p.pois[0].id, priority: 'must', scheduledDay: 3 })
  p = planReducer(p, { type: 'set-days', days: 2 })
  assert.equal(p.pois[0].priority, 'must')
  assert.equal(p.pois[0].scheduledDay, null)
})
test('删除来源不误删无关无来源地点；交通节点删除保留方式', () => {
  let p = seed()
  const [a, b, via] = p.pois
  p.pois[0].sources = []
  p.pois[1].sources = []
  p = planReducer(p, { type: 'set-poi-arrangement', poiId: a.id, scheduledDay: 1 })
  p = planReducer(p, { type: 'set-poi-arrangement', poiId: b.id, scheduledDay: 1 })
  p = planReducer(p, { type: 'set-transport-segment', day: 1, fromPoiId: a.id, toPoiId: b.id, viaPoiId: via.id, mode: 'metro', durationMinutes: 30 })
  p = planReducer(p, { type: 'delete-source-record-and-orphaned-pois', source: { ...source, id: 's', parseStatus: 'succeeded' } })
  assert.equal(p.pois.length, 2)
  assert.equal(p.dayPlans[0].transportSegments[0].mode, 'metro')
  assert.equal(p.dayPlans[0].transportSegments[0].viaPoiId, undefined)
})
test('重新排序清理失效交通段', () => {
  let p = seed()
  for (const poi of p.pois) p = planReducer(p, { type: 'set-poi-arrangement', poiId: poi.id, scheduledDay: 1 })
  p = planReducer(p, { type: 'set-transport-segment', day: 1, fromPoiId: p.pois[0].id, toPoiId: p.pois[1].id, mode: 'walk' })
  p = planReducer(p, { type: 'reorder-day-pois', day: 1, poiIds: p.pois.map(item => item.id).reverse() })
  assert.equal(p.dayPlans[0].transportSegments, undefined)
})
test('相同高德 POI ID 合并并保留来源', () => {
  let p = seed()
  for (const poi of p.pois.slice(0, 2)) p = planReducer(p, { type: 'confirm-poi-location', poiId: poi.id, mapPoiId: 'same-id', longitude: 120, latitude: 30, address: '' })
  assert.equal(p.pois.length, 2)
  assert.equal(p.pois[0].sources.length, 2)
})
test('超经典路线不成为超经典路，交通单独识别', () => {
  const items = extractPoiCandidates('① 夜游西湖：\n断桥 北山街 孤山路 ＞白堤折返，全程约3公里，超经典路线适合首次来杭的朋友。\n交通：地铁1号线凤起路站F口出。')
  assert.ok(!items.some(item => item.name.includes('经典')))
  assert.ok(items.some(item => item.name === '凤起路站' && item.kind === 'transport'))
})
test('损坏的本地 JSON 保留恢复副本，不静默丢弃', () => {
  const written = new Map()
  const original = window.localStorage
  window.localStorage = { getItem: () => '{broken', setItem: (key, value) => written.set(key, value) }
  try {
    const result = loadPlan(emptyPlan)
    assert.equal(written.get('trip-atlas:recovery:plan'), '{broken')
    assert.ok(result.notice.includes('恢复副本'))
  } finally { window.localStorage = original }
})
test('备份拒绝非 HTTP 来源链接', () => {
  const p = seed()
  p.pois[0].sources[0].url = 'javascript:alert(1)'
  assert.equal(isTravelPlan(p), false)
})
