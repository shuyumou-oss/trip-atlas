import { createContext, type Dispatch, type ReactNode, useContext, useEffect, useReducer, useState } from 'react'
import { defaultPlan, emptyPlan } from './seed'
import { loadPlan, savePlan } from './storage'
import type { DayPart, DayPlan, Poi, PoiCategory, PoiPriority, Source, SourceRecord, TransportMode, TransportSegment, TransportType, TravelPlan } from './types'

type PlanAction =
  | { type: 'replace-plan'; plan: TravelPlan }
  | { type: 'set-days'; days: number }
  | { type: 'update-plan-settings'; cityName: string; cityAdcode: string; days: number }
  | { type: 'set-poi-arrangement'; poiId: string; priority?: PoiPriority; scheduledDay?: number | null }
  | { type: 'set-poi-day-part'; poiId: string; dayPart: DayPart | null }
  | { type: 'reorder-day-pois'; day: number; poiIds: string[] }
  | { type: 'set-transport-segment'; day: number; fromPoiId: string; toPoiId: string; mode?: TransportMode | null; durationMinutes?: number | null; viaPoiId?: string | null }
  | { type: 'set-day-note'; day: number; note: string }
  | { type: 'set-poi-note'; poiId: string; note: string }
  | { type: 'clear-all-pois' }
  | { type: 'confirm-imported-pois'; candidates: Array<Pick<Poi, 'name' | 'category' | 'transportType'>>; source: Source }
  | { type: 'update-poi-source'; poiId: string; sourceIndex: number; title: string; url: string | null }
  | { type: 'remove-poi-source'; poiId: string; sourceIndex: number }
  | { type: 'confirm-poi-location'; poiId: string; mapPoiId: string; longitude: number; latitude: number; address: string }
  | { type: 'mark-poi-location-unavailable'; poiId: string }
  | { type: 'add-source-record'; source: SourceRecord }
  | { type: 'update-source-record'; sourceId: string; parseStatus: SourceRecord['parseStatus']; failureReason?: string; title?: string }
  | { type: 'delete-source-record-and-orphaned-pois'; source: SourceRecord }

function normalizePoiName(name: string) {
  return name.trim().toLocaleLowerCase().replace(/[\s·・,，.。()（）\-—]/g, '')
}

function makePoiId(name: string) {
  return `poi-${normalizePoiName(name)}-${Date.now().toString(36)}`
}

function sourceMatchesRecord(source: Source, record: SourceRecord) {
  return source.title === record.title && source.url === record.url
}

function isAdjacentPair(poiIds: string[], segment: Pick<TransportSegment, 'fromPoiId' | 'toPoiId'>) {
  return poiIds.some((poiId, index) => poiId === segment.fromPoiId && poiIds[index + 1] === segment.toPoiId)
}

function suggestedTransportMode(poi?: Poi): TransportMode | undefined {
  if (poi?.transportType === '地铁站') return 'metro'
  if (poi?.transportType === '公交站') return 'bus'
  return undefined
}

function buildDayPlan(day: number, poiIds: string[], previous: DayPlan | undefined, transportNodeDays: Map<string, number | null>): DayPlan {
  const transportSegments = (previous?.transportSegments ?? []).filter((segment) => isAdjacentPair(poiIds, segment)).map((segment) => segment.viaPoiId && transportNodeDays.get(segment.viaPoiId) !== null && transportNodeDays.get(segment.viaPoiId) !== day ? { ...segment, viaPoiId: undefined } : segment)
  return {
    day,
    poiIds,
    note: previous?.note,
    ...(transportSegments.length ? { transportSegments } : {}),
  }
}

function synchronizeDayPlans(days: number, pois: Poi[], existing: DayPlan[]): DayPlan[] {
  const transportNodeDays = new Map(pois.filter((poi) => poi.category === '交通').map((poi) => [poi.id, poi.scheduledDay] as const))
  return Array.from({ length: days }, (_, index) => {
    const day = index + 1
    const previous = existing.find((item) => item.day === day)
    const scheduledIds = pois.filter((poi) => poi.scheduledDay === day).map((poi) => poi.id)
    const orderedIds = previous?.poiIds.filter((poiId) => scheduledIds.includes(poiId)) ?? []
    const missingIds = scheduledIds.filter((poiId) => !orderedIds.includes(poiId))
    return buildDayPlan(day, [...orderedIds, ...missingIds], previous, transportNodeDays)
  })
}

type PlanContextValue = {
  plan: TravelPlan
  dispatch: Dispatch<PlanAction>
  storageNotice: string | null
}

const PlanContext = createContext<PlanContextValue | null>(null)

export function planReducer(plan: TravelPlan, action: PlanAction): TravelPlan {
  switch (action.type) {
    case 'replace-plan':
      return action.plan
    case 'set-days': {
      if (action.days < 2 || action.days > 5) return plan
      const pois = plan.pois.map((poi) => {
        return poi.scheduledDay && poi.scheduledDay > action.days ? { ...poi, scheduledDay: null, dayPart: undefined } : poi
      })
      return {
        ...plan,
        days: action.days,
        pois,
        dayPlans: synchronizeDayPlans(action.days, pois, plan.dayPlans),
      }
    }
    case 'update-plan-settings': {
      if (!action.cityName || action.days < 2 || action.days > 5) return plan
      const pois = plan.pois.map((poi) => {
        const next = poi.scheduledDay && poi.scheduledDay > action.days ? { ...poi, scheduledDay: null, dayPart: undefined } : poi
        return action.cityAdcode === plan.cityAdcode ? next : { ...next, locationStatus: 'needs_confirmation' as const, mapPoiId: undefined, mapProvider: undefined, longitude: undefined, latitude: undefined, address: undefined }
      })
      return {
        ...plan,
        cityName: action.cityName,
        cityAdcode: action.cityAdcode,
        days: action.days,
        pois,
        dayPlans: synchronizeDayPlans(action.days, pois, plan.dayPlans),
      }
    }
    case 'set-poi-arrangement': {
      const pois = plan.pois.map((poi) => poi.id !== action.poiId ? poi : {
        ...poi,
        priority: action.priority ?? poi.priority,
        scheduledDay: action.scheduledDay === undefined ? poi.scheduledDay : action.scheduledDay,
        dayPart: action.scheduledDay === null ? undefined : poi.dayPart,
      })
      return {
        ...plan,
        pois,
        dayPlans: action.scheduledDay === undefined ? plan.dayPlans : synchronizeDayPlans(plan.days, pois, plan.dayPlans),
      }
    }
    case 'set-poi-day-part':
      return {
        ...plan,
        pois: plan.pois.map((poi) => poi.id !== action.poiId || poi.scheduledDay === null ? poi : { ...poi, dayPart: action.dayPart ?? undefined }),
      }
    case 'reorder-day-pois': {
      if (action.day < 1 || action.day > plan.days) return plan
      const scheduledIds = plan.pois.filter((poi) => poi.scheduledDay === action.day).map((poi) => poi.id)
      const orderedIds = action.poiIds.filter((poiId, index, list) => scheduledIds.includes(poiId) && list.indexOf(poiId) === index)
      const missingIds = scheduledIds.filter((poiId) => !orderedIds.includes(poiId))
      const transportNodeDays = new Map(plan.pois.filter((poi) => poi.category === '交通').map((poi) => [poi.id, poi.scheduledDay] as const))
      return { ...plan, dayPlans: plan.dayPlans.map((item) => item.day === action.day ? buildDayPlan(item.day, [...orderedIds, ...missingIds], item, transportNodeDays) : item) }
    }
    case 'set-transport-segment': {
      if (action.day < 1 || action.day > plan.days) return plan
      const dayPlan = plan.dayPlans.find((item) => item.day === action.day)
      if (!dayPlan || !isAdjacentPair(dayPlan.poiIds, action)) return plan
      const existingSegment = dayPlan.transportSegments?.find((segment) => segment.fromPoiId === action.fromPoiId && segment.toPoiId === action.toPoiId)
      const selectedViaPoi = action.viaPoiId === undefined ? undefined : action.viaPoiId === null ? undefined : plan.pois.find((poi) => poi.id === action.viaPoiId && poi.category === '交通' && (poi.scheduledDay === null || poi.scheduledDay === action.day))
      if (action.viaPoiId && !selectedViaPoi) return plan
      const nextSegment: TransportSegment = {
        fromPoiId: action.fromPoiId,
        toPoiId: action.toPoiId,
        mode: action.mode === undefined ? existingSegment?.mode ?? suggestedTransportMode(selectedViaPoi) : action.mode ?? undefined,
        durationMinutes: action.durationMinutes === undefined ? existingSegment?.durationMinutes : action.durationMinutes && action.durationMinutes >= 1 && action.durationMinutes <= 1440 ? Math.round(action.durationMinutes) : undefined,
        viaPoiId: action.viaPoiId === undefined ? existingSegment?.viaPoiId : selectedViaPoi?.id,
      }
      const transportSegments = [
        ...(dayPlan.transportSegments ?? []).filter((segment) => segment.fromPoiId !== action.fromPoiId || segment.toPoiId !== action.toPoiId),
        ...(nextSegment.mode || nextSegment.durationMinutes || nextSegment.viaPoiId ? [nextSegment] : []),
      ]
      return {
        ...plan,
        dayPlans: plan.dayPlans.map((item) => item.day !== action.day ? item : {
          ...item,
          ...(transportSegments.length ? { transportSegments } : { transportSegments: undefined }),
        }),
      }
    }
    case 'set-day-note':
      return {
        ...plan,
        dayPlans: plan.dayPlans.map((item) => item.day === action.day ? { ...item, note: action.note.trim() || undefined } : item),
      }
    case 'set-poi-note':
      return {
        ...plan,
        pois: plan.pois.map((poi) => poi.id !== action.poiId ? poi : { ...poi, note: action.note.trim() || undefined }),
      }
    case 'clear-all-pois':
      return { ...plan, pois: [], dayPlans: plan.dayPlans.map((item) => ({ ...item, poiIds: [], note: undefined, transportSegments: undefined })) }
    case 'confirm-imported-pois': {
      const pois = [...plan.pois]
      for (const candidate of action.candidates) {
        const normalizedName = normalizePoiName(candidate.name)
        if (!normalizedName) continue
        const existingIndex = pois.findIndex((poi) => {
          const names = [poi.name, ...poi.aliases].map(normalizePoiName)
          return names.includes(normalizedName)
        })
        if (existingIndex >= 0) {
          const existing = pois[existingIndex]
          pois[existingIndex] = {
            ...existing,
            aliases: normalizePoiName(existing.name) === normalizedName || existing.aliases.some((alias) => normalizePoiName(alias) === normalizedName)
              ? existing.aliases
              : [...existing.aliases, candidate.name],
            sources: [...existing.sources, action.source],
          }
          continue
        }
        pois.push({
          id: makePoiId(candidate.name),
          name: candidate.name.trim(),
          category: candidate.category,
          transportType: candidate.category === '交通' ? candidate.transportType ?? '其他' : undefined,
          aliases: [],
          priority: 'normal',
          scheduledDay: null,
          sources: [action.source],
          locationStatus: 'needs_confirmation',
        })
      }
      return { ...plan, pois, dayPlans: synchronizeDayPlans(plan.days, pois, plan.dayPlans) }
    }
    case 'update-poi-source':
      return {
        ...plan,
        pois: plan.pois.map((poi) => poi.id !== action.poiId ? poi : {
          ...poi,
          sources: poi.sources.map((source, index) => index !== action.sourceIndex ? source : {
            ...source,
            title: action.title.trim() || source.title,
            url: action.url?.trim() || null,
          }),
        }),
      }
    case 'remove-poi-source':
      return {
        ...plan,
        pois: plan.pois.map((poi) => poi.id !== action.poiId ? poi : {
          ...poi,
          sources: poi.sources.filter((_source, index) => index !== action.sourceIndex),
        }),
      }
    case 'confirm-poi-location': {
      const current = plan.pois.find((poi) => poi.id === action.poiId)
      const duplicate = plan.pois.find((poi) => poi.id !== action.poiId && poi.mapPoiId === action.mapPoiId)
      if (current && duplicate) {
        const pois = plan.pois.filter((poi) => poi.id !== current.id).map((poi) => poi.id !== duplicate.id ? poi : {
          ...poi, aliases: Array.from(new Set([...poi.aliases, current.name, ...current.aliases])).filter((name) => name !== poi.name),
          sources: [...poi.sources, ...current.sources], note: [poi.note, current.note].filter(Boolean).join('\n') || undefined,
          scheduledDay: poi.scheduledDay ?? current.scheduledDay, priority: poi.priority === 'must' || current.priority === 'must' ? 'must' as const : poi.priority,
        })
        const dayPlans = plan.dayPlans.map((dayPlan) => ({ ...dayPlan, poiIds: Array.from(new Set(dayPlan.poiIds.map((id) => id === current.id ? duplicate.id : id))), transportSegments: dayPlan.transportSegments?.map((segment) => ({ ...segment, viaPoiId: segment.viaPoiId === current.id ? duplicate.id : segment.viaPoiId })) }))
        return { ...plan, pois, dayPlans: synchronizeDayPlans(plan.days, pois, dayPlans) }
      }
      return {
        ...plan,
        pois: plan.pois.map((poi) => poi.id !== action.poiId ? poi : {
          ...poi,
          locationStatus: 'confirmed',
          mapProvider: 'amap',
          mapPoiId: action.mapPoiId,
          longitude: action.longitude,
          latitude: action.latitude,
          address: action.address,
        }),
      }
    }
    case 'mark-poi-location-unavailable':
      return {
        ...plan,
        pois: plan.pois.map((poi) => poi.id !== action.poiId ? poi : { ...poi, locationStatus: 'unavailable' }),
      }
    case 'add-source-record':
      return { ...plan, sourceLibrary: [action.source, ...plan.sourceLibrary] }
    case 'update-source-record':
      return {
        ...plan,
        sourceLibrary: plan.sourceLibrary.map((source) => source.id !== action.sourceId ? source : {
          ...source,
          parseStatus: action.parseStatus,
          failureReason: action.failureReason,
          title: action.title?.trim() || source.title,
        }),
      }
    case 'delete-source-record-and-orphaned-pois': {
      const pois = plan.pois.flatMap((poi) => {
        if (!poi.sources.some((source) => sourceMatchesRecord(source, action.source))) return [poi]
        const remainingSources = poi.sources.filter((source) => !sourceMatchesRecord(source, action.source))
        return remainingSources.length ? [{ ...poi, sources: remainingSources }] : []
      })
      return {
        ...plan,
        pois,
        dayPlans: synchronizeDayPlans(plan.days, pois, plan.dayPlans),
        sourceLibrary: plan.sourceLibrary.filter((source) => source.id !== action.source.id),
      }
    }
    default:
      return plan
  }
}

export function PlanProvider({ children }: { children: ReactNode }) {
  const [{ plan: initialPlan, notice }] = useState(() => loadPlan(new URLSearchParams(window.location.search).get('demo') === '1' ? defaultPlan : emptyPlan))
  const [plan, dispatch] = useReducer(planReducer, initialPlan)

  const [saveNotice, setSaveNotice] = useState<string | null>(null)
  useEffect(() => {
    setSaveNotice(savePlan(plan) ? null : '本地保存失败。请导出计划备份，关闭页面可能丢失修改。')
  }, [plan])

  return <PlanContext.Provider value={{ plan, dispatch, storageNotice: saveNotice ?? notice }}>{children}</PlanContext.Provider>
}

export function usePlan() {
  const value = useContext(PlanContext)
  if (!value) throw new Error('usePlan 必须在 PlanProvider 内使用。')
  return value
}
