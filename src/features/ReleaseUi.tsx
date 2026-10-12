import { useState } from 'react'
import { usePlan } from './plan/PlanProvider'
import type { PoiCategory, TransportType, TravelPlan } from './plan/types'

const categories: PoiCategory[] = ['景点', '美食', '咖啡 / 休闲', '街区 / 购物', '其他', '交通']
const transportTypes: TransportType[] = ['地铁站', '火车 / 高铁站', '机场', '公交站', '码头', '停车点', '其他']

export function Welcome({ onCreate, onClose }: { onCreate: () => void; onClose: () => void }) {
  const appBaseUrl = import.meta.env.BASE_URL
  return <div className="day-picker-backdrop"><section className="welcome-dialog day-picker" role="dialog" aria-modal="true" aria-label="欢迎来到行囊">
    <p className="eyebrow">TRIP ATLAS · 行囊</p><h2>收藏了很多攻略，<br />这次，串成自己的旅行。</h2>
    <p className="dialog-copy">把攻略里的地点放在同一张地图上，按兴趣挑选，再慢慢安排到每一天。</p>
    <ol className="welcome-steps"><li><b>收拢地点</b><span>粘贴攻略文字，检查识别结果。</span></li><li><b>对照地图</b><span>确认位置，标记必去和待定。</span></li><li><b>安排每天</b><span>拖拽排序，添加备注和交通安排。</span></li></ol>
    <div className="welcome-actions"><a className="primary-button" href={`${appBaseUrl}?demo=1`}>体验杭州示例 →</a><button className="subtle-button" onClick={onCreate}>创建我的旅行计划</button></div>
    <p className="input-note">计划仅保存在当前浏览器，可随时导出备份。攻略链接用来回看来源，正文需要另行粘贴。</p>
    <button className="welcome-dismiss" onClick={onClose}>先看看工作台</button>
  </section></div>
}

export function ManualPoiDialog({ onClose }: { onClose: () => void }) {
  const { dispatch } = usePlan()
  const [name, setName] = useState('')
  const [category, setCategory] = useState<PoiCategory>('景点')
  const [transportType, setTransportType] = useState<TransportType>('地铁站')
  return <div className="day-picker-backdrop" onClick={onClose}><form className="day-picker" role="dialog" aria-modal="true" aria-label="手动添加地点" onClick={event => event.stopPropagation()} onSubmit={event => {
    event.preventDefault()
    if (!name.trim()) return
    dispatch({ type: 'confirm-imported-pois', candidates: [{ name: name.trim(), category, transportType }], source: { title: '手动添加', url: null, importedAt: new Date().toISOString(), method: 'manual' } })
    onClose()
  }}><p className="eyebrow">补充地点</p><h2>还有哪里想去？</h2><label className="input-label" htmlFor="manual-name">地点名称</label><input id="manual-name" autoFocus required maxLength={40} value={name} onChange={event => setName(event.target.value)} placeholder="例如：中国茶叶博物馆" />
    <label className="input-label" htmlFor="manual-category">地点类别</label><select id="manual-category" value={category} onChange={event => setCategory(event.target.value as PoiCategory)}>{categories.map(item => <option key={item}>{item}</option>)}</select>
    {category === '交通' && <><label className="input-label" htmlFor="manual-transport">交通种类</label><select id="manual-transport" value={transportType} onChange={event => setTransportType(event.target.value as TransportType)}>{transportTypes.map(item => <option key={item}>{item}</option>)}</select></>}
    <p className="input-note">添加后可在地点详情确认地图位置。已有同名地点会合并。</p><div className="dialog-actions"><button type="button" className="subtle-button" onClick={onClose}>取消</button><button className="primary-button" disabled={!name.trim()}>加入地点池 →</button></div>
  </form></div>
}

export function downloadPlan(plan: TravelPlan) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = '行囊-' + plan.cityName + '-计划.json'
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
