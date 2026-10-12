import type { TravelPlan } from './types'

export const emptyPlan: TravelPlan = {
  id: 'new-plan', cityName: '杭州', cityAdcode: '330100', days: 3,
  dayPlans: [1, 2, 3].map((day) => ({ day, poiIds: [] })), sourceLibrary: [], pois: [],
}

const demoSource = { title: '行囊杭州示例', url: null, importedAt: '2026-10-12T00:00:00.000Z', method: 'manual' as const }

// 2026-10-12 按地点名和杭州编码查询后选定的少量演示地点；不是全国 POI 数据库。
export const defaultPlan: TravelPlan = {
  id: 'demo-hangzhou-v2', cityName: '杭州', cityAdcode: '330100', days: 3,
  dayPlans: [
    { day: 1, poiIds: ['demo-hefang', 'demo-west-lake'], transportSegments: [{ fromPoiId: 'demo-hefang', toPoiId: 'demo-west-lake', mode: 'walk', durationMinutes: 35 }] },
    { day: 2, poiIds: ['demo-lingyin'] },
    { day: 3, poiIds: [] },
  ],
  sourceLibrary: [{ ...demoSource, id: 'demo-source', parseStatus: 'succeeded' }],
  pois: [
    { id: 'demo-west-lake', name: '西湖', category: '景点', aliases: ['西湖景区'], priority: 'must', scheduledDay: 1, dayPart: 'afternoon', note: '湖边散步，看日落。交通时长为示例手动填写。', sources: [demoSource], locationStatus: 'confirmed', mapProvider: 'amap', mapPoiId: 'B0FFFEDKS3', longitude: 120.144302, latitude: 30.246255, address: '西湖区' },
    { id: 'demo-lingyin', name: '灵隐寺', category: '景点', aliases: ['灵隐'], priority: 'must', scheduledDay: 2, dayPart: 'morning', note: '出发前自行核对预约和开放时间。', sources: [demoSource], locationStatus: 'confirmed', mapProvider: 'amap', mapPoiId: 'B023B02842', longitude: 120.101406, latitude: 30.240826, address: '法云弄1号' },
    { id: 'demo-hefang', name: '河坊街', category: '街区 / 购物', aliases: ['清河坊'], priority: 'normal', scheduledDay: 1, dayPart: 'morning', note: '沿街慢慢逛，记录喜欢的小店。', sources: [demoSource], locationStatus: 'confirmed', mapProvider: 'amap', mapPoiId: 'B0FFGQ772L', longitude: 120.16863, latitude: 30.2401, address: '上城区' },
    { id: 'demo-zhiweiguan', name: '知味观', category: '美食', aliases: [], priority: 'maybe', scheduledDay: null, sources: [demoSource], locationStatus: 'needs_confirmation' },
    { id: 'demo-qingzhiwu', name: '青芝坞', category: '咖啡 / 休闲', aliases: [], priority: 'normal', scheduledDay: null, sources: [demoSource], locationStatus: 'needs_confirmation' },
  ],
}
