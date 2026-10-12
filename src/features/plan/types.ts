export type PoiCategory = '景点' | '美食' | '咖啡 / 休闲' | '街区 / 购物' | '其他' | '交通'

export type TransportType = '地铁站' | '火车 / 高铁站' | '机场' | '公交站' | '码头' | '停车点' | '其他'

export type PoiPriority = 'normal' | 'must' | 'maybe'

export type DayPart = 'morning' | 'afternoon' | 'evening'

export type TransportMode = 'walk' | 'metro' | 'bus' | 'taxi' | 'drive' | 'bike' | 'other'

export type TransportSegment = {
  fromPoiId: string
  toPoiId: string
  mode?: TransportMode
  durationMinutes?: number
  viaPoiId?: string
}

export type PoiLocationStatus = 'needs_confirmation' | 'confirmed' | 'unavailable'

export type Source = {
  title: string
  url: string | null
  importedAt: string
  method: 'link' | 'text' | 'manual'
}

export type SourceRecord = {
  id: string
  title: string
  url: string | null
  importedAt: string
  method: 'link' | 'text' | 'manual'
  parseStatus: 'failed' | 'text_only' | 'succeeded'
  failureReason?: string
}

export type Poi = {
  id: string
  name: string
  category: PoiCategory
  transportType?: TransportType
  aliases: string[]
  note?: string
  priority: PoiPriority
  scheduledDay: number | null
  dayPart?: DayPart
  sources: Source[]
  locationStatus: PoiLocationStatus
  mapProvider?: 'amap'
  mapPoiId?: string
  longitude?: number
  latitude?: number
  address?: string
}

export type DayPlan = {
  day: number
  poiIds: string[]
  note?: string
  transportSegments?: TransportSegment[]
}

export type TravelPlan = {
  id: string
  cityName: string
  cityAdcode: string
  days: number
  dayPlans: DayPlan[]
  pois: Poi[]
  sourceLibrary: SourceRecord[]
}
