import type { DayPart, DayPlan, Poi, PoiCategory, PoiLocationStatus, PoiPriority, Source, SourceRecord, TransportMode, TransportSegment, TransportType, TravelPlan } from './types'

export const PLAN_STORAGE_KEY = new URLSearchParams(window.location.search).get('demo') === '1' ? 'trip-atlas:v2:demo' : 'trip-atlas:v1:plan'

type LoadResult = {
  plan: TravelPlan
  notice: string | null
}

const categories: PoiCategory[] = ['景点', '美食', '咖啡 / 休闲', '街区 / 购物', '其他', '交通']
const transportTypes: TransportType[] = ['地铁站', '火车 / 高铁站', '机场', '公交站', '码头', '停车点', '其他']
const transportModes: TransportMode[] = ['walk', 'metro', 'bus', 'taxi', 'drive', 'bike', 'other']

function isPoiPriority(value: unknown): value is PoiPriority {
  return value === 'normal' || value === 'must' || value === 'maybe'
}

function isDayPart(value: unknown): value is DayPart {
  return value === 'morning' || value === 'afternoon' || value === 'evening'
}

function isPoiLocationStatus(value: unknown): value is PoiLocationStatus {
  return value === 'needs_confirmation' || value === 'confirmed' || value === 'unavailable'
}

function isSource(value: unknown): value is Source {
  if (!value || typeof value !== 'object') return false
  const source = value as Partial<Source>
  return typeof source.title === 'string' && typeof source.importedAt === 'string'
    && (source.url === null || (typeof source.url === 'string' && /^https?:\/\//i.test(source.url)))
    && ['link', 'text', 'manual'].includes(source.method ?? '')
}

function isTransportSegment(value: unknown): value is TransportSegment {
  if (!value || typeof value !== 'object') return false
  const segment = value as Partial<TransportSegment>
  return typeof segment.fromPoiId === 'string'
    && typeof segment.toPoiId === 'string'
    && (segment.mode === undefined || transportModes.includes(segment.mode))
    && (segment.durationMinutes === undefined || (Number.isInteger(segment.durationMinutes) && segment.durationMinutes >= 1 && segment.durationMinutes <= 1440))
    && (segment.viaPoiId === undefined || typeof segment.viaPoiId === 'string')
}

function isPoi(value: unknown): value is Poi {
  if (!value || typeof value !== 'object') return false
  const poi = value as Partial<Poi>
  return typeof poi.id === 'string'
    && typeof poi.name === 'string'
    && categories.includes(poi.category as PoiCategory)
    && (poi.category !== '交通' || poi.transportType === undefined || transportTypes.includes(poi.transportType))
    && Array.isArray(poi.aliases)
    && poi.aliases.every((alias) => typeof alias === 'string')
    && (poi.note === undefined || typeof poi.note === 'string')
    && (poi.dayPart === undefined || isDayPart(poi.dayPart))
    && isPoiPriority(poi.priority)
    && isPoiLocationStatus(poi.locationStatus)
    && (poi.locationStatus !== 'confirmed' || (Number.isFinite(poi.longitude) && Number.isFinite(poi.latitude)))
    && (poi.scheduledDay === null || (Number.isInteger(poi.scheduledDay) && Number(poi.scheduledDay) >= 1 && Number(poi.scheduledDay) <= 5))
    && Array.isArray(poi.sources)
    && poi.sources.every(isSource)
}

function isDayPlan(value: unknown): value is DayPlan {
  if (!value || typeof value !== 'object') return false
  const dayPlan = value as Partial<DayPlan>
  return Number.isInteger(dayPlan.day)
    && Number(dayPlan.day) >= 1
    && Number(dayPlan.day) <= 5
    && Array.isArray(dayPlan.poiIds)
    && dayPlan.poiIds.every((poiId) => typeof poiId === 'string')
    && (dayPlan.note === undefined || typeof dayPlan.note === 'string')
    && (dayPlan.transportSegments === undefined || (Array.isArray(dayPlan.transportSegments) && dayPlan.transportSegments.every(isTransportSegment)))
}

function isSourceRecord(value: unknown): value is SourceRecord {
  if (!value || typeof value !== 'object') return false
  const source = value as Partial<SourceRecord>
  return typeof source.id === 'string'
    && typeof source.title === 'string'
    && (source.url === null || (typeof source.url === 'string' && /^https?:\/\//i.test(source.url)))
    && typeof source.importedAt === 'string'
    && (source.method === 'link' || source.method === 'text' || source.method === 'manual')
    && (source.parseStatus === 'failed' || source.parseStatus === 'text_only' || source.parseStatus === 'succeeded')
}

export function isTravelPlan(value: unknown): value is TravelPlan {
  if (!value || typeof value !== 'object') return false
  const plan = value as Partial<TravelPlan>
  return typeof plan.id === 'string'
    && typeof plan.cityName === 'string'
    && typeof plan.cityAdcode === 'string'
    && Number.isInteger(plan.days)
    && Boolean(plan.days && plan.days >= 2 && plan.days <= 5)
    && Array.isArray(plan.dayPlans)
    && plan.dayPlans.length === plan.days
    && plan.dayPlans.every(isDayPlan)
    && Array.isArray(plan.pois)
    && plan.pois.every(isPoi)
    && Array.isArray(plan.sourceLibrary)
    && plan.sourceLibrary.every(isSourceRecord)
}

export function loadPlan(fallback: TravelPlan): LoadResult {
  let saved: string | null = null
  try {
    saved = window.localStorage.getItem(PLAN_STORAGE_KEY)
    if (!saved) return { plan: fallback, notice: null }
    const parsed: unknown = migrateLegacyPlan(JSON.parse(saved))
    if (isTravelPlan(parsed)) return { plan: parsed, notice: '已恢复这个浏览器中保存的旅行计划。' }
    window.localStorage.setItem('trip-atlas:recovery:plan', saved)
    return { plan: fallback, notice: '检测到无效旧计划，已保留原始恢复副本并载入初始计划。' }
  } catch {
    if (saved) {
      try {
        window.localStorage.setItem('trip-atlas:recovery:plan', saved)
        return { plan: fallback, notice: '旧计划无法解析，已保留原始恢复副本并载入初始计划。' }
      } catch { /* Storage itself may be unavailable; never claim a backup exists. */ }
    }
    return { plan: fallback, notice: '暂时无法读取本地计划，已载入初始计划。请检查浏览器存储权限。' }
  }
}

function migrateLegacyPlan(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value
  const plan = value as { pois?: unknown[]; days?: unknown; dayPlans?: unknown }
  if (!Array.isArray(plan.pois)) return value
  const existingLibrary = (plan as { sourceLibrary?: unknown }).sourceLibrary
  const rawSourceLibrary = Array.isArray(existingLibrary) && existingLibrary.length > 0 ? existingLibrary : plan.pois.flatMap((item, index) => {
    if (!item || typeof item !== 'object') return []
    const sources = (item as { sources?: unknown }).sources
    if (!Array.isArray(sources)) return []
    return sources.flatMap((source, sourceIndex) => {
      if (!source || typeof source !== 'object') return []
      const itemSource = source as { title?: unknown; url?: unknown; importedAt?: unknown; method?: unknown }
      if (typeof itemSource.title !== 'string' || typeof itemSource.importedAt !== 'string') return []
      return [{
        id: `legacy-source-${index}-${sourceIndex}-${itemSource.importedAt}`,
        title: itemSource.title,
        url: typeof itemSource.url === 'string' ? itemSource.url : null,
        importedAt: itemSource.importedAt,
        method: itemSource.method === 'link' || itemSource.method === 'manual' ? itemSource.method : 'text',
        parseStatus: 'succeeded' as const,
      }]
    })
  })
  const sourceKeys = new Set<string>()
  const sourceLibrary = rawSourceLibrary.filter((source) => {
    if (!source || typeof source !== 'object') return true
    const itemSource = source as { title?: unknown; url?: unknown; importedAt?: unknown; method?: unknown }
    const key = `${itemSource.title ?? ''}|${itemSource.url ?? ''}|${itemSource.importedAt ?? ''}|${itemSource.method ?? ''}`
    if (sourceKeys.has(key)) return false
    sourceKeys.add(key)
    return true
  })
  const pois = plan.pois.map((item) => {
    if (!item || typeof item !== 'object') return item
    const poi = item as Record<string, unknown>
    if ('priority' in poi && 'scheduledDay' in poi) {
      return { ...poi, locationStatus: isPoiLocationStatus(poi.locationStatus) ? poi.locationStatus : 'needs_confirmation' }
    }
    const legacyStatus = typeof poi.status === 'string' ? poi.status : 'unassigned'
    const scheduledDay = /^day([1-5])$/.exec(legacyStatus)
    return {
      ...poi,
      priority: legacyStatus === 'must' ? 'must' : legacyStatus === 'maybe' ? 'maybe' : 'normal',
      scheduledDay: scheduledDay ? Number(scheduledDay[1]) : null,
      locationStatus: 'needs_confirmation',
    }
  })
  const days = typeof plan.days === 'number' && Number.isInteger(plan.days) && plan.days >= 2 && plan.days <= 5 ? plan.days : 2
  const rawDayPlans = Array.isArray(plan.dayPlans) ? plan.dayPlans : []
  const dayPlans = Array.from({ length: days }, (_, index) => {
    const day = index + 1
    const previous = rawDayPlans.find((item) => item && typeof item === 'object' && (item as { day?: unknown }).day === day) as Partial<DayPlan> | undefined
    const scheduledIds = pois.flatMap((item) => item && typeof item === 'object' && (item as { scheduledDay?: unknown }).scheduledDay === day && typeof (item as { id?: unknown }).id === 'string' ? [(item as { id: string }).id] : [])
    const orderedIds = Array.isArray(previous?.poiIds) ? previous.poiIds.filter((poiId): poiId is string => typeof poiId === 'string' && scheduledIds.includes(poiId)) : []
    const poiIds = [...orderedIds, ...scheduledIds.filter((poiId) => !orderedIds.includes(poiId))]
    const transportNodeDays = new Map(pois.flatMap((poi) => {
      if (!poi || typeof poi !== 'object' || (poi as { category?: unknown }).category !== '交通' || typeof (poi as { id?: unknown }).id !== 'string') return []
      const scheduledDay = (poi as { scheduledDay?: unknown }).scheduledDay
      return [[(poi as { id: string }).id, Number.isInteger(scheduledDay) ? Number(scheduledDay) : null] as const]
    }))
    const transportSegments = Array.isArray(previous?.transportSegments)
      ? previous.transportSegments.filter((segment) => isTransportSegment(segment) && poiIds.some((poiId, segmentIndex) => poiId === segment.fromPoiId && poiIds[segmentIndex + 1] === segment.toPoiId)).map((segment) => segment.viaPoiId && transportNodeDays.get(segment.viaPoiId) !== null && transportNodeDays.get(segment.viaPoiId) !== day ? { ...segment, viaPoiId: undefined } : segment)
      : []
    return {
      day,
      poiIds,
      note: typeof previous?.note === 'string' ? previous.note : undefined,
      ...(transportSegments.length ? { transportSegments } : {}),
    }
  })
  return {
    ...plan,
    sourceLibrary,
    pois,
    dayPlans,
  }
}

export function savePlan(plan: TravelPlan): boolean {
  try {
    window.localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(plan))
    return true
  } catch {
    return false
  }
}
