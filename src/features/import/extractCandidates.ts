import type { TransportType } from '../plan/types'

export type PoiCandidate = {
  id: string
  name: string
  kind: 'poi' | 'transport'
  transportType?: TransportType
  evidence?: string
}

const placeSuffixes = ['博物馆', '美术馆', '动物园', '植物园', '游乐园', '海洋馆', '历史文化街区', '历史街区', '步行街', '巷子', '古镇', '古城', '咖啡', '书店', '茶社', '夜市', '广场', '码头', '景区', '公园', '寺', '祠', '塔', '桥', '湖', '山', '街', '路', '巷', '店', '馆', '楼', '院']
const placePattern = new RegExp(`([\u4e00-\u9fa5]{2,14}?(?:${placeSuffixes.join('|')}))`, 'g')
const complexPlacePattern = /([\u4e00-\u9fa5]{2,14}(?:博物馆|美术馆|动物园|植物园|游乐园|海洋馆|历史文化街区|历史街区|步行街))/g
const metroPattern = /(?:地铁\s*\d+\s*号线\s*)?([\u4e00-\u9fa5]{2,10}站)(?:[A-ZＡ-Ｚ]\s*口)?/g
const airportPattern = /([\u4e00-\u9fa5]{2,12}(?:国际)?机场)/g
const busPattern = /(?:公交\s*)?([\u4e00-\u9fa5]{2,12}公交站)/g
const wharfPattern = /([\u4e00-\u9fa5]{2,12}码头)/g
const parkingPattern = /([\u4e00-\u9fa5]{2,12}(?:停车场|停车点))/g
const listPrefix = /^[\s\-—•*#\d①②③④⑤⑥⑦⑧⑨⑩一二三四五六七八九十]+[、.．)）：:\s]*/
const removablePrefixes = /^(推荐|打卡|去了|去|逛|吃|喝|住|玩|安排|上午|下午|晚上|早上|中午|然后|再去|附近|这里|我们|可以|一定要|夜游|漫游|游览|对面是|分钟到|到|和|与)/
const routeDescriptionWords = ['经典', '路线', '全程', '适合', '交通', '朋友', '氛围', '推荐', '公里', '首次', '折返', '慢悠悠', '夜游', '漫游', '游船', '青石板', '白墙', '黛瓦', '路灯', '梧桐', '货船']

function cleanName(value: string) {
  let cleaned = value
    .replace(listPrefix, '')
    .replace(/[，,。！!？?；;：:]+$/g, '')
    .replace(/(折返|往返|出发|结束)$/g, '')
    .trim()
  while (removablePrefixes.test(cleaned)) cleaned = cleaned.replace(removablePrefixes, '').trim()
  return cleaned
}

function isRouteDescription(name: string) {
  return routeDescriptionWords.some((word) => name.includes(word))
}

function inferStationType(name: string): TransportType {
  return /(?:火车|高铁|铁路|动车|东|西|南|北)站$/.test(name) ? '火车 / 高铁站' : '地铁站'
}

function addCandidate(candidates: PoiCandidate[], nameValue: string, kind: PoiCandidate['kind'], transportType?: TransportType) {
  const name = cleanName(nameValue)
  if (name.length < 2 || name.length > 18 || (kind === 'poi' && isRouteDescription(name))) return
  if (candidates.some((candidate) => candidate.kind === kind && (candidate.name === name || candidate.name.includes(name)))) return
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const candidate = candidates[index]
    if (candidate.kind === kind && name.includes(candidate.name)) candidates.splice(index, 1)
  }
  candidates.push({ id: `${kind}-${name}-${candidates.length}`, name, kind, transportType })
}

function extractRouteList(text: string, candidates: PoiCandidate[]) {
  for (const line of text.split(/\n+/)) {
    if (!/[＞>→]/.test(line)) continue
    const routePart = line.split(/[，,。！!？?；;]/)[0]
    for (const item of routePart.split(/[＞>→\s]+/)) addCandidate(candidates, item, 'poi')
  }
}

/**
 * 第一版用可解释规则召回候选：明确清单、#地点#、路线箭头和常见地点词尾。
 * 交通节点默认未选，用户可选择进入地点池。
 */
export function extractPoiCandidates(text: string): PoiCandidate[] {
  const candidates: PoiCandidate[] = []

  for (const match of text.matchAll(/#([^#\n]{2,18})#/g)) addCandidate(candidates, match[1], 'poi')

  let textWithoutTransit = text
  const transportPatterns: Array<{ pattern: RegExp; type: TransportType; resolveName?: (name: string) => TransportType }> = [
    { pattern: airportPattern, type: '机场' },
    { pattern: busPattern, type: '公交站' },
    { pattern: wharfPattern, type: '码头' },
    { pattern: parkingPattern, type: '停车点' },
    { pattern: metroPattern, type: '地铁站', resolveName: inferStationType },
  ]
  for (const { pattern, type, resolveName } of transportPatterns) {
    textWithoutTransit = textWithoutTransit.replace(new RegExp(pattern.source, 'g'), (_match, stationName: string) => {
      addCandidate(candidates, stationName, 'transport', resolveName?.(stationName) ?? type)
      return ' '
    })
  }

  for (const line of textWithoutTransit.split(/\n+/)) {
    const candidate = cleanName(line)
    if (candidate.length >= 2 && candidate.length <= 18 && !/[，,。！!？?；;]/.test(candidate) && !removablePrefixes.test(candidate)) addCandidate(candidates, candidate, 'poi')
  }

  extractRouteList(textWithoutTransit, candidates)

  for (const match of textWithoutTransit.matchAll(complexPlacePattern)) addCandidate(candidates, match[1], 'poi')
  for (const match of textWithoutTransit.matchAll(placePattern)) addCandidate(candidates, match[1], 'poi')

  return candidates.slice(0, 30)
}
