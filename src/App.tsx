import { Fragment, useEffect, useRef, useState } from 'react'
import { Welcome, ManualPoiDialog, downloadPlan } from './features/ReleaseUi'
import { emptyPlan } from './features/plan/seed'
import { isTravelPlan } from './features/plan/storage'
import { extractWithAi } from './features/import/aiExtract'
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { findCityAdcode, mainlandCities } from './features/plan/cities'
import { extractPoiCandidates, type PoiCandidate } from './features/import/extractCandidates'
import { usePlan } from './features/plan/PlanProvider'
import type { DayPart, Poi, PoiCategory, PoiPriority, SourceRecord, TransportMode, TransportSegment, TransportType, TravelPlan } from './features/plan/types'
import { AmapMap } from './features/map/AmapMap'
import { searchMapPois, type MapPoiCandidate } from './features/map/poiSearch'

type ReviewCandidate = PoiCandidate & {
  category: PoiCategory
  selected: boolean
}

type LinkDraft = {
  id: string
  url: string
  title: string
}

const placeCategories: Exclude<PoiCategory, '交通'>[] = ['景点', '美食', '咖啡 / 休闲', '街区 / 购物', '其他']
const transportTypes: TransportType[] = ['地铁站', '火车 / 高铁站', '机场', '公交站', '码头', '停车点', '其他']

function inferCategory(name: string): PoiCategory {
  if (/(咖啡|茶社|书店)/.test(name)) return '咖啡 / 休闲'
  if (/(街区|步行街|夜市|商场|市集|店)/.test(name)) return '街区 / 购物'
  if (/(餐厅|饭店|小吃|面馆|火锅|酒家|知味观)/.test(name)) return '美食'
  return '景点'
}

function statusClass(poi: Pick<Poi, 'priority' | 'scheduledDay'>) {
  if (poi.priority === 'must') return 'must'
  if (poi.priority === 'maybe') return 'maybe'
  return poi.scheduledDay ? 'day' : ''
}

function schedulingLabel(poi: Pick<Poi, 'scheduledDay'>) {
  return poi.scheduledDay ? `Day ${poi.scheduledDay}` : '未安排'
}

function orderedDayPois(plan: TravelPlan, day: number) {
  const dayPlan = plan.dayPlans.find((item) => item.day === day)
  const scheduledPois = plan.pois.filter((poi) => poi.scheduledDay === day)
  const ordered = (dayPlan?.poiIds ?? []).flatMap((poiId) => scheduledPois.filter((poi) => poi.id === poiId))
  return [...ordered, ...scheduledPois.filter((poi) => !ordered.some((item) => item.id === poi.id))]
}

const dayPartLabels: Record<DayPart, string> = { morning: '上午', afternoon: '下午', evening: '晚上' }
const transportModeLabels: Record<TransportMode, string> = { walk: '步行', metro: '地铁', bus: '公交', taxi: '打车', drive: '自驾', bike: '骑行', other: '其他' }

function App() {
  const { plan, dispatch, storageNotice } = usePlan()
  const isStaticDemo = import.meta.env.VITE_STATIC_DEMO === 'true'
  const appBaseUrl = import.meta.env.BASE_URL
  const isDemo = new URLSearchParams(window.location.search).get('demo') === '1'
  const wantsNewPlan = new URLSearchParams(window.location.search).get('new') === '1'
  const [isWelcomeOpen, setIsWelcomeOpen] = useState(plan.id === 'new-plan' && !plan.pois.length && !isDemo && !wantsNewPlan)
  const [isManualOpen, setIsManualOpen] = useState(false)
  const [isNewPlan, setIsNewPlan] = useState(wantsNewPlan)
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const [isSavingSettings, setIsSavingSettings] = useState(false)
  const [aiAvailable, setAiAvailable] = useState(false)
  const [extractMode, setExtractMode] = useState<'rules' | 'ai'>('rules')
  const [isExtracting, setIsExtracting] = useState(false)
  const [extractionNotice, setExtractionNotice] = useState('')
  const [backupError, setBackupError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (isStaticDemo) return
    let cancelled = false
    fetch('/api/config').then(response => response.json()).then(config => {
      if (!cancelled) setAiAvailable(config.aiAvailable === true)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])
  const [isPlanSettingsOpen, setIsPlanSettingsOpen] = useState(wantsNewPlan)
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [importMode, setImportMode] = useState<'text' | 'links'>('text')
  const [isSourceLibraryOpen, setIsSourceLibraryOpen] = useState(false)
  const [isPoiManageOpen, setIsPoiManageOpen] = useState(false)
  const [isClearPoiDialogOpen, setIsClearPoiDialogOpen] = useState(false)
  const [sourceToDelete, setSourceToDelete] = useState<SourceRecord | null>(null)
  const [isCandidateReviewOpen, setIsCandidateReviewOpen] = useState(false)
  const [draftCity, setDraftCity] = useState(plan.cityName)
  const [draftDays, setDraftDays] = useState(plan.days)
  const [importText, setImportText] = useState('')
  const [candidates, setCandidates] = useState<ReviewCandidate[]>([])
  const [importError, setImportError] = useState<string | null>(null)
  const [sourceTitle, setSourceTitle] = useState('')
  const [sourceUrl, setSourceUrl] = useState<string | null>(null)
  const [sourceRecordId, setSourceRecordId] = useState<string | null>(null)
  const [linkText, setLinkText] = useState('')
  const [linkDrafts, setLinkDrafts] = useState<LinkDraft[]>([])
  const [selectedPoiId, setSelectedPoiId] = useState<string | null>(null)
  const [mapFocusedPoiId, setMapFocusedPoiId] = useState<string | null>(null)
  const [locationPoiId, setLocationPoiId] = useState<string | null>(null)
  const [isArrangementOpen, setIsArrangementOpen] = useState(true)
  const [activeMapGroup, setActiveMapGroup] = useState('all')
  const [editingDay, setEditingDay] = useState<number | null>(null)
  const [activeDragPoiId, setActiveDragPoiId] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<'all' | PoiCategory>('all')
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  const groupedUnscheduledPriority = (priority: PoiPriority) => plan.pois.filter((poi) => poi.priority === priority && poi.scheduledDay === null)
  const groupedDay = (day: number) => orderedDayPois(plan, day)
  const plannedCount = plan.pois.filter((poi) => poi.scheduledDay !== null).length
  const poiCandidates = candidates.filter((candidate) => candidate.kind === 'poi')
  const transportCandidates = candidates.filter((candidate) => candidate.kind === 'transport')
  const selectedPoi = plan.pois.find((poi) => poi.id === selectedPoiId) ?? null
  const locationPoi = plan.pois.find((poi) => poi.id === locationPoiId) ?? null
  const activeDragPoi = plan.pois.find((poi) => poi.id === activeDragPoiId) ?? null
  const placePois = plan.pois.filter((poi) => poi.category !== '交通')
  const transportPois = plan.pois.filter((poi) => poi.category === '交通')
  const filteredPlacePois = activeFilter === 'all' ? placePois : placePois.filter((poi) => poi.category === activeFilter)
  const confirmedLocationCount = plan.pois.filter((poi) => poi.locationStatus === 'confirmed').length
  const focusedPoiId = mapFocusedPoiId
  const effectiveMapGroup = activeMapGroup.startsWith('day:') && Number(activeMapGroup.slice(4)) > plan.days ? 'all' : activeMapGroup
  const arrangementGroups = [
    { id: 'priority:must', label: '必去', tone: 'must', pois: groupedUnscheduledPriority('must') },
    { id: 'priority:maybe', label: '待定', tone: 'maybe', pois: groupedUnscheduledPriority('maybe') },
    ...Array.from({ length: plan.days }, (_, i) => ({ id: `day:${i + 1}`, label: `Day ${i + 1}`, tone: 'day', pois: groupedDay(i + 1) })),
  ]
  const highlightedPoiIds = effectiveMapGroup === 'all' ? null : plan.pois.filter((poi) =>
    effectiveMapGroup.startsWith('day:') ? poi.scheduledDay === Number(effectiveMapGroup.slice(4)) : poi.priority === effectiveMapGroup.slice(9)
  ).map((poi) => poi.id)
  function focusPoi(poiId: string) {
    setMapFocusedPoiId(poiId)
    setSelectedPoiId(null)
  }
  function openPoi(poiId: string) {
    setMapFocusedPoiId(poiId)
    setSelectedPoiId(poiId)
  }
  function openDayEditor(day: number) {
    setActiveMapGroup(`day:${day}`)
    setSelectedPoiId(null)
    setMapFocusedPoiId(null)
    setEditingDay(day)
  }
  const orphanedPoiCount = sourceToDelete ? plan.pois.filter((poi) => poi.sources.some((source) => isSourceFromRecord(source, sourceToDelete)) && poi.sources.every((source) => isSourceFromRecord(source, sourceToDelete))).length : 0

  function setPoiPriority(poiId: string, priority: PoiPriority) {
    dispatch({ type: 'set-poi-arrangement', poiId, priority })
  }

  function setPoiDay(poiId: string, scheduledDay: number | null) {
    dispatch({ type: 'set-poi-arrangement', poiId, scheduledDay })
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragPoiId(null)
    if (!event.over) return
    const poiId = String(event.active.data.current?.poiId ?? event.active.id)
    const target = String(event.over.id)
    if (target === 'priority:must' || target === 'priority:maybe') setPoiPriority(poiId, target.slice(9) as PoiPriority)
    if (/^day:[1-5]$/.test(target)) setPoiDay(poiId, Number(target.slice(4)))
  }

  function openPlanSettings() {
    setSettingsError(null)
    setIsNewPlan(false)
    setDraftCity(plan.cityName)
    setDraftDays(plan.days)
    setIsPlanSettingsOpen(true)
  }

  async function savePlanSettings() {
    let cityName = draftCity.trim()
    if (!cityName || isSavingSettings) return
    setIsSavingSettings(true)
    setSettingsError(null)
    try {
      let cityAdcode = findCityAdcode(cityName)
      if (cityAdcode === 'pending') {
        if (isStaticDemo) throw new Error('公开演示版暂不支持在线查询新城市，请选择常用城市，或在本地/完整线上版继续。')
        const response = await fetch('/api/city-search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: cityName }), signal: AbortSignal.timeout(25000) })
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error)
        if (payload.cities?.length !== 1) throw new Error('未找到唯一城市，请输入完整城市名，例如“嘉兴市”。')
        cityName = payload.cities[0].name
        cityAdcode = payload.cities[0].adcode
      }
      if (isNewPlan) dispatch({ type: 'replace-plan', plan: { ...emptyPlan, id: 'plan-' + Date.now(), cityName, cityAdcode, days: draftDays, dayPlans: Array.from({ length: draftDays }, (_, index) => ({ day: index + 1, poiIds: [] })) } })
      else dispatch({ type: 'update-plan-settings', cityName, cityAdcode, days: draftDays })
      setIsPlanSettingsOpen(false)
      setIsWelcomeOpen(false)
      if (isNewPlan) { window.history.replaceState(null, '', window.location.pathname); openImport() }
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : '城市查询失败，请稍后重试。')
    } finally { setIsSavingSettings(false) }
  }

  async function restoreBackup(file?: File) {
    if (!file) return
    try {
      if (file.size > 2000000) throw new Error('备份文件过大。')
      const value: unknown = JSON.parse(await file.text())
      if (!isTravelPlan(value)) throw new Error('这不是有效的行囊计划文件。')
      if (plan.pois.length && !window.confirm('恢复备份将替换当前计划。请先导出当前计划。确定继续？')) return
      dispatch({ type: 'replace-plan', plan: value })
      setIsWelcomeOpen(false)
      setBackupError(null)
    } catch (error) { setBackupError(error instanceof Error ? error.message : '备份读取失败。') }
    if (fileRef.current) fileRef.current.value = ''
  }

  function openImport() {
    setImportError(null)
    setSourceTitle('')
    setSourceUrl(null)
    setSourceRecordId(null)
    setImportMode('text')
    setLinkText('')
    setLinkDrafts([])
    setIsImportOpen(true)
  }

  async function reviewCandidates() {
    if (isExtracting) return
    setIsExtracting(true)
    setImportError(null)
    let extracted: (PoiCandidate & { category?: PoiCategory })[]
    try {
      extracted = extractMode === 'ai' ? await extractWithAi(importText, plan.cityName) : extractPoiCandidates(importText)
      setExtractionNotice(extractMode === 'ai' ? 'AI 提取 · 每个地点附原文证据，请确认后加入。' : '规则识别 · 请检查地点名称和类别。')
    } catch (error) {
      setImportError(error instanceof Error ? error.message : '识别失败。请切换规则识别继续。')
      setIsExtracting(false)
      return
    }
    setIsExtracting(false)
    if (!extracted.length) {
      setImportError('暂未识别到地点。试试用“#地点#”、一行一个地点，或写出完整地点名称。')
      return
    }
    setCandidates(extracted.map((candidate) => ({
      ...candidate,
      selected: candidate.kind === 'poi',
      category: candidate.category ?? (candidate.kind === 'transport' ? '交通' : inferCategory(candidate.name)),
      transportType: candidate.kind === 'transport' ? candidate.transportType ?? '其他' : undefined,
    })))
    setIsImportOpen(false)
    setIsCandidateReviewOpen(true)
  }

  function confirmCandidates() {
    const confirmed = candidates.filter((candidate) => candidate.selected && candidate.name.trim())
    if (!confirmed.length) {
      setImportError('请至少保留一个地点或交通节点，或返回继续编辑攻略文字。')
      return
    }
    const resolvedSourceTitle = sourceTitle.trim() || (sourceRecordId ? '补充文字的攻略' : `粘贴攻略 · ${new Date().toLocaleDateString('zh-CN')}`)
    dispatch({
      type: 'confirm-imported-pois',
      candidates: confirmed.map(({ name, category, transportType }) => ({ name, category, transportType })),
      source: {
        title: resolvedSourceTitle,
        url: sourceUrl,
        importedAt: new Date().toISOString(),
        method: 'text',
      },
    })
    if (sourceRecordId) {
      dispatch({ type: 'update-source-record', sourceId: sourceRecordId, parseStatus: 'text_only', title: resolvedSourceTitle })
    } else {
      dispatch({ type: 'add-source-record', source: makeSourceRecord({ title: resolvedSourceTitle, url: sourceUrl, method: 'text', parseStatus: 'succeeded' }) })
    }
    setIsCandidateReviewOpen(false)
    setCandidates([])
    setImportText('')
    setSourceUrl(null)
    setSourceRecordId(null)
  }

  function collectLinkDrafts() {
    const links = extractXiaohongshuLinks(linkText)
    if (!links.length) {
      setImportError('没有找到有效的小红书链接。可以直接粘贴小红书完整分享文案，系统会自动提取其中的链接。')
      return
    }
    const sharedTitle = links.length === 1 ? extractSharedTitle(linkText) : ''
    setLinkDrafts((current) => [...current, ...links.filter((url) => !current.some((item) => item.url === url)).map((url) => ({ id: `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, url, title: sharedTitle || '待补充文字的攻略' }))])
    setLinkText('')
    setImportError(null)
  }

  function submitLinks() {
    if (!linkDrafts.length) return
    linkDrafts.forEach((draft) => dispatch({ type: 'add-source-record', source: makeSourceRecord({ title: draft.title.trim() || '待补充文字的攻略', url: draft.url, method: 'link', parseStatus: 'failed', failureReason: '当前尚未接入已授权的公开笔记内容读取服务。' }) }))
    setLinkDrafts([])
    setIsImportOpen(false)
    setIsSourceLibraryOpen(true)
  }

  function startTextFallback(source: SourceRecord) {
    setSourceTitle(source.title === '待补充文字的攻略' ? '' : source.title)
    setSourceUrl(source.url)
    setSourceRecordId(source.id)
    setImportText('')
    setImportError(null)
    setImportMode('text')
    setIsSourceLibraryOpen(false)
    setIsImportOpen(true)
  }

  return (
    <div className={`app-shell ${isDemo ? 'is-demo' : ''}`}>
      <header className="topbar">
        <a className="brand" href="#" aria-label="行囊首页"><span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><rect x="5" y="7" width="14" height="14" rx="4" stroke="currentColor" strokeWidth="1.8" /><path d="M9 7V5a3 3 0 0 1 6 0v2M9 12h6M9 16h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg></span><span>行囊</span></a>
        <button className="plan-settings-trigger" type="button" onClick={openPlanSettings} aria-haspopup="dialog"><span className="summary-dot" /><span className="plan-settings-label">行程设置</span><span className="plan-settings-value">{plan.cityName} · {plan.days} 天</span><span aria-hidden="true">⌄</span></button>
        <div className="topbar-actions"><details className="workspace-tools"><summary>更多</summary><div><button onClick={() => setIsWelcomeOpen(true)}>使用指南</button><button onClick={() => downloadPlan(plan)}>导出计划备份</button><button onClick={() => fileRef.current?.click()}>恢复计划备份</button></div></details><button className="source-library-trigger" type="button" onClick={() => setIsSourceLibraryOpen(true)}>来源库</button><button className="add-button" type="button" onClick={openImport}>＋ 导入攻略</button></div>
      </header>
      <DndContext sensors={sensors} onDragStart={(event) => setActiveDragPoiId(String(event.active.data.current?.poiId ?? event.active.id))} onDragCancel={() => setActiveDragPoiId(null)} onDragEnd={handleDragEnd}>
      <main className="planner">
        <section className="poi-panel">
          <div className="section-heading"><div className="pool-title"><h1>地点池</h1><p>收藏的地方，在这里慢慢挑。</p></div><div className="poi-heading-actions"><span className="poi-count">{plan.pois.length} 个地点</span><div className="poi-manage"><button className="poi-manage-trigger" type="button" aria-label="管理地点池" aria-expanded={isPoiManageOpen} onClick={() => setIsPoiManageOpen((current) => !current)}>···</button>{isPoiManageOpen && <div className="poi-manage-menu"><button type="button" disabled={!plan.pois.length} onClick={() => { setIsPoiManageOpen(false); setIsClearPoiDialogOpen(true) }}>清空地点池</button></div>}</div></div></div>
          {!plan.pois.length && <p className="setup-hint">从目的地开始，准备你的旅行。<button type="button" onClick={openPlanSettings}>设置城市与天数</button></p>}
          <p className="state-note">点地点查看详情，拖入下方分组安排日期。</p>
          <section className="poi-group" aria-label="游玩与消费地点"><div className="poi-group-heading"><h3>游玩与消费地点</h3><span>{activeFilter === 'all' ? `${placePois.length} 个` : `显示 ${filteredPlacePois.length} 个`}</span></div><div className="filter-tabs"><button className={activeFilter === 'all' ? 'active' : ''} type="button" onClick={() => setActiveFilter('all')}>全部 {placePois.length}</button>{placeCategories.map((category) => <button className={activeFilter === category ? 'active' : ''} key={category} type="button" onClick={() => setActiveFilter(category)}>{category.replace(' / 休闲', '').replace(' / 购物', '')} {placePois.filter((poi) => poi.category === category).length}</button>)}</div><div className="poi-list">{filteredPlacePois.length ? filteredPlacePois.map((poi) => <DraggablePoiChip key={poi.id} poi={poi} onAssign={() => openPoi(poi.id)} onViewSources={() => openPoi(poi.id)} />) : <p className="empty-branch">这个类别还没有地点。</p>}</div></section>
          <details className="transport-poi-group"><summary>交通节点 <span>{transportPois.length} 个</span></summary><p>抵达、换乘或离开时会用到的地点。</p><div className="poi-list">{transportPois.length ? transportPois.map((poi) => <DraggablePoiChip key={poi.id} poi={poi} onAssign={() => openPoi(poi.id)} onViewSources={() => openPoi(poi.id)} />) : <span className="empty-branch">还没有交通节点。</span>}</div></details>
          {!placePois.length && <p className="empty-pool-note">还没有游玩地点。导入一段攻略文字，或手动添加你想去的地方。</p>}
          <button className="manual-add" type="button" onClick={() => setIsManualOpen(true)}>＋ 手动添加地点</button>
          <div className="plan-backup"><span>{isDemo ? '示例计划独立保存' : '仅保存在当前浏览器'}</span><input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={event => void restoreBackup(event.target.files?.[0])} /></div>
          {backupError && <p className="import-error" role="alert">{backupError}</p>}
          {storageNotice?.includes('失败') && <p className="import-error" role="alert">{storageNotice}</p>}
        </section>
        <section className="map-workspace" aria-label="地图与旅行安排">
          <div className="workspace-heading">
            <div><h2>{plan.cityName}旅行计划</h2><span className="workspace-subtitle">{plan.days} 天的旅程，由你安排</span></div>
            <p>地图已定位 {confirmedLocationCount} 个<span className="stats-separator" />已安排 {plannedCount} 个</p>
          </div>
          <div className="workspace-map-stage">
            <AmapMap cityName={plan.cityName} pois={plan.pois} focusedPoiId={focusedPoiId} highlightedPoiIds={highlightedPoiIds}
              onMarkerClick={(poiId) => { if (focusedPoiId === poiId) setSelectedPoiId(poiId); else focusPoi(poiId) }}
              onResetView={() => { setSelectedPoiId(null); setMapFocusedPoiId(null) }} />
            {selectedPoi && <PoiDetailDialog key={selectedPoi.id} poi={selectedPoi} onClose={() => setSelectedPoiId(null)}
              onConfirmLocation={() => { setSelectedPoiId(null); setLocationPoiId(selectedPoi.id) }} />}
          </div>
          <section className="arrangement-panel" aria-label="旅行脑图">
            <div className="arrangement-heading"><div><b>我的旅行安排</b><span>拖入分组，或点地点查看地图</span></div>
              <button type="button" aria-expanded={isArrangementOpen} aria-controls="arrangement-board" onClick={() => setIsArrangementOpen((open) => !open)}>{isArrangementOpen ? '收起安排 ⌄' : '展开安排 ⌃'}</button>
            </div>
            <div className="arrangement-tabs" aria-label="地图分组筛选">
              <button type="button" aria-pressed={effectiveMapGroup === 'all'} onClick={() => setActiveMapGroup('all')}>全部 <span>{plan.pois.length}</span></button>
              {arrangementGroups.map((group) => <button key={group.id} type="button" aria-pressed={effectiveMapGroup === group.id} onClick={() => {
                if (group.id.startsWith('day:') && effectiveMapGroup === group.id) openDayEditor(Number(group.id.slice(4)))
                else setActiveMapGroup(group.id)
              }}>{group.label} <span>{group.id.startsWith('priority:') ? plan.pois.filter((poi) => poi.priority === group.id.slice(9)).length : group.pois.length}</span></button>)}
            </div>
            {isArrangementOpen && <div className="arrangement-board" id="arrangement-board">
              {arrangementGroups.map((group) => <Branch key={group.id} className={`${group.tone} ${effectiveMapGroup === group.id ? 'is-active-group' : ''}`} title={group.label} subtitle={group.id.startsWith('priority:') ? '尚未安排日期' : `${group.pois.length} 个地点`} dropId={group.id} locations={group.pois} onSelect={focusPoi} onOpenDay={group.id.startsWith('day:') ? () => openDayEditor(Number(group.id.slice(4))) : undefined} />)}
            </div>}
            <p className="arrangement-footnote">{effectiveMapGroup === 'all' ? '点地图标记聚焦，再点一次安排日期。' : '地图突出当前分组，淡色地点仍可点击加入安排。'}</p>
          </section>
        </section>
      </main>
      <DragOverlay>{activeDragPoi ? <span className="drag-overlay">{activeDragPoi.name}</span> : null}</DragOverlay>
      </DndContext>
      {isWelcomeOpen && <Welcome onCreate={() => { if (isDemo) { window.location.href = `${appBaseUrl}?new=1`; return } setIsWelcomeOpen(false); openPlanSettings(); setIsNewPlan(true) }} onClose={() => setIsWelcomeOpen(false)} />}
      {isManualOpen && <ManualPoiDialog onClose={() => setIsManualOpen(false)} />}
      {isDemo && <div className="demo-banner">杭州示例体验 · 与你的计划分开保存<a href={appBaseUrl}>返回我的计划 →</a></div>}
      {isPlanSettingsOpen && <div className="day-picker-backdrop" onClick={() => setIsPlanSettingsOpen(false)}>
        <section className="day-picker plan-settings" role="dialog" aria-modal="true" aria-label="旅行计划设置" onClick={(event) => event.stopPropagation()}>
          <div><p className="eyebrow">旅行计划</p><h2>先定目的地，<br />再慢慢安排。</h2></div>
          <label className="input-label" htmlFor="cityName">中国大陆旅行城市</label>
          <input id="cityName" list="mainland-city-options" value={draftCity} onChange={(event) => setDraftCity(event.target.value)} placeholder="输入或选择城市，例如杭州" autoComplete="off" />
          <datalist id="mainland-city-options">{mainlandCities.map((city) => <option key={city.adcode} value={city.name} />)}</datalist>
          <p className="input-note">常用城市可直接选择；其他中国大陆城市将在保存时查询并确认。</p>
          <p className="input-label">旅行时长</p>
          <div className="day-scroll-list compact" role="listbox" aria-label="旅行时长">
            {[2, 3, 4, 5].map((days) => <button className={days === draftDays ? 'selected' : ''} key={days} type="button" role="option" aria-selected={days === draftDays} onClick={() => setDraftDays(days)}><b>{days}</b><span>天</span></button>)}
          </div>
          <p className="input-note">若减少天数，超出日期范围的地点会变为未安排，优先级保留。</p>
          {isNewPlan && plan.pois.length > 0 && <p className="delete-source-warning">创建新计划会替换当前计划。建议先导出备份；杭州示例与个人计划分别保存。</p>}
          {settingsError && <p className="import-error" role="alert">{settingsError}</p>}
          <div className="dialog-actions"><button className="subtle-button" type="button" onClick={() => setIsPlanSettingsOpen(false)}>取消</button><button className="primary-button" type="button" onClick={savePlanSettings} disabled={!draftCity.trim() || isSavingSettings}>{isSavingSettings ? '确认城市中…' : '保存计划'} <span>→</span></button></div>
        </section>
      </div>}
      {isImportOpen && <div className="day-picker-backdrop" onClick={() => { if (!isExtracting) setIsImportOpen(false) }}>
        <section className="day-picker import-dialog-modal" role="dialog" aria-modal="true" aria-label="粘贴攻略文字" onClick={(event) => event.stopPropagation()}>
          <div><p className="eyebrow">导入攻略</p><h2>先把攻略文字，<br />放进来。</h2></div>
          <div className="import-mode-tabs"><button className={importMode === 'text' ? 'active' : ''} type="button" disabled={isExtracting} onClick={() => { setImportMode('text'); setImportError(null) }}>粘贴文字</button><button className={importMode === 'links' ? 'active' : ''} type="button" disabled={isExtracting} onClick={() => { setImportMode('links'); setImportError(null) }}>批量链接</button></div>
          {importMode === 'text' ? <><p className="dialog-copy">候选地点需要由你检查后，下一步才会加入地点池。</p>{sourceUrl && <p className="source-link-note">正在为已保存链接补充文字；原帖链接会继续保留。</p>}<label className="input-label" htmlFor="guideText">攻略文字</label><textarea id="guideText" maxLength={10000} disabled={isExtracting} value={importText} onChange={(event) => { setImportText(event.target.value); setImportError(null) }} placeholder={'例如：\n- 宽窄巷子\n- 武侯祠\n晚上去建设路，再到#望平街#喝咖啡'} /><label className="input-label" htmlFor="sourceTitle">这篇攻略叫什么</label><input id="sourceTitle" value={sourceTitle} onChange={(event) => setSourceTitle(event.target.value)} placeholder="例如：杭州三天两夜收藏版（可不填）" /><p className="input-note">优先识别清单、箭头路线和 #地点#。地铁站会作为交通参考单独显示；“经典路线”等描述不会被当作地点。</p></> : <><p className="dialog-copy">粘贴一篇或多篇完整分享文案，保存为可回看的来源卡片。当前不会自动读取链接正文；可从来源库补充攻略文字并识别地点。</p><label className="input-label" htmlFor="guideLinks">小红书分享内容或链接</label><textarea id="guideLinks" value={linkText} onChange={(event) => { setLinkText(event.target.value); setImportError(null) }} placeholder={'杭州3天纯玩零绕路！…\nhttps://xhslink.cn/o/...\n【小红书】里有精彩内容，快去瞧瞧！'} /><button className="collect-links-button" type="button" onClick={collectLinkDrafts} disabled={!linkText.trim()}>提取链接到收集箱</button>{linkDrafts.length > 0 && <section className="link-draft-list"><p className="link-draft-count">已收集 {linkDrafts.length} 篇攻略</p>{linkDrafts.map((draft) => <article className="link-draft-card" key={draft.id}><input aria-label="攻略标题" value={draft.title} onChange={(event) => setLinkDrafts((current) => current.map((item) => item.id === draft.id ? { ...item, title: event.target.value } : item))} /><code>{draft.url}</code><button type="button" onClick={() => setLinkDrafts((current) => current.filter((item) => item.id !== draft.id))}>删除</button></article>)}</section>}<p className="input-note">支持 xiaohongshu.com、xhslink.com 与 xhslink.cn。卡片保存前可继续粘贴更多分享文案。</p></>}
          {importMode === 'text' && <div className="extract-options"><label><input type="radio" checked={extractMode === 'rules'} disabled={isExtracting} onChange={() => setExtractMode('rules')} />规则识别</label><label><input type="radio" checked={extractMode === 'ai'} disabled={!aiAvailable || isExtracting} onChange={() => setExtractMode('ai')} />AI 提取{!aiAvailable && '（暂未启用）'}</label><span>AI 启用后，攻略文字会发送给模型服务。候选仍由你确认。</span></div>}
          {importError && <p className="import-error" role="alert">{importError}</p>}
          <div className="dialog-actions"><button className="subtle-button" type="button" onClick={() => { if (!isExtracting) setIsImportOpen(false) }}>取消</button><button className="primary-button" type="button" onClick={importMode === 'text' ? reviewCandidates : submitLinks} disabled={isExtracting || (importMode === 'text' ? !importText.trim() : !linkDrafts.length)}>{importMode === 'text' ? (isExtracting ? '识别中…' : '识别地点') : `保存 ${linkDrafts.length || ''} 篇攻略`} <span>→</span></button></div>
        </section>
      </div>}
      {isCandidateReviewOpen && <div className="day-picker-backdrop" onClick={() => setIsCandidateReviewOpen(false)}>
        <section className="day-picker candidate-dialog" role="dialog" aria-modal="true" aria-label="检查地点候选" onClick={(event) => event.stopPropagation()}>
          <div><p className="eyebrow">检查候选</p><h2>识别到 {poiCandidates.length} 个地点</h2></div>
          <p className="input-note">{extractionNotice}</p>
          <p className="dialog-copy">勾选后才会加入地点池。交通节点默认不选；需要时可选择交通种类并一同加入。</p>
          <div className="candidate-list">
            <CandidateSection title={`旅行 POI · ${poiCandidates.length}`} candidates={poiCandidates} onChange={setCandidates} />
            {transportCandidates.length > 0 && <CandidateSection title={`交通节点 · ${transportCandidates.length}`} candidates={transportCandidates} onChange={setCandidates} isTransport />}
            {!candidates.length && <p className="empty-branch">没有保留候选；可返回重新输入。</p>}
          </div>
          {importError && <p className="import-error" role="alert">{importError}</p>}
          <div className="dialog-actions"><button className="subtle-button" type="button" onClick={() => { setIsCandidateReviewOpen(false); setIsImportOpen(true) }}>返回编辑</button><button className="primary-button" type="button" onClick={confirmCandidates}>加入地点池 <span>→</span></button></div>
        </section>
      </div>}
      {locationPoi && <MapLocationDialog poi={locationPoi} cityName={plan.cityName} cityAdcode={plan.cityAdcode} isStaticDemo={isStaticDemo} onClose={() => setLocationPoiId(null)} />}
      {isSourceLibraryOpen && <SourceLibraryDialog onClose={() => setIsSourceLibraryOpen(false)} onFallback={startTextFallback} onDelete={setSourceToDelete} />}
      {sourceToDelete && <DeleteSourceDialog source={sourceToDelete} orphanedPoiCount={orphanedPoiCount} onClose={() => setSourceToDelete(null)} />}
      {isClearPoiDialogOpen && <div className="day-picker-backdrop" onClick={() => setIsClearPoiDialogOpen(false)}><section className="day-picker clear-pois-dialog" role="dialog" aria-modal="true" aria-label="清空地点池" onClick={(event) => event.stopPropagation()}><div><p className="eyebrow">管理地点池</p><h2>清空全部地点？</h2></div><p className="dialog-copy">将删除当前地点池中的 {plan.pois.length} 个地点，以及它们的脑图安排、地图确认信息和个人备注。</p><p className="delete-source-warning">攻略来源库与原帖链接会保留，不会被删除。此操作当前无法撤销。</p><div className="dialog-actions"><button className="subtle-button" type="button" onClick={() => setIsClearPoiDialogOpen(false)}>取消</button><button className="danger-button" type="button" onClick={() => { dispatch({ type: 'clear-all-pois' }); setSelectedPoiId(null); setLocationPoiId(null); setMapFocusedPoiId(null); setIsClearPoiDialogOpen(false) }}>清空 {plan.pois.length} 个地点</button></div></section></div>}
      {editingDay !== null && <DayEditor key={editingDay} day={editingDay} onChangeDay={setEditingDay} onBack={() => setEditingDay(null)} />}
    </div>
  )
}

function DraggablePoiChip({ poi, onAssign, onViewSources }: { poi: Poi; onAssign: () => void; onViewSources: () => void }) {
  const { dispatch } = usePlan()
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `pool:${poi.id}`, data: { poiId: poi.id } })
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined
  return <span className={`poi-chip-wrap ${poi.category === '交通' ? 'transport-chip' : ''} ${statusClass(poi)} ${isDragging ? 'is-dragging' : ''}`} ref={setNodeRef} style={style}><button className="poi-chip" type="button" {...listeners} {...attributes} onClick={onAssign}><PlaceIcon category={poi.category} /><span className="pool-poi-name">{poi.name}</span><i className="pool-category">{poi.category === '交通' ? poi.transportType ?? '交通' : poi.category.split(' / ')[0]}</i></button><button className="source-button" type="button" onClick={onViewSources} aria-label={`查看${poi.name}的来源`}>来源 {poi.sources.length}</button><button className="pool-star" type="button" aria-label={`${poi.priority === 'must' ? '取消' : '标为'}必去：${poi.name}`} aria-pressed={poi.priority === 'must'} onClick={() => dispatch({ type: 'set-poi-arrangement', poiId: poi.id, priority: poi.priority === 'must' ? 'normal' : 'must' })}>{poi.priority === 'must' ? '★' : '☆'}</button></span>
}

function PlaceIcon({ category }: { category: PoiCategory }) {
  const paths: Record<string, string> = {
    '景点': 'M3 20 10 7l4 7 3-5 5 11H3Z M7 13l3 2 2-3 M17 5h.01',
    '美食': 'M3 11h18c-1 6-4 9-9 9s-8-3-9-9Z M6 7l2-4 M12 7l2-4 M18 7l2-4',
    '咖啡 / 休闲': 'M4 8h13v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Z M17 9h2a3 3 0 0 1 0 6h-2 M8 4v1 M12 3v2',
    '街区 / 购物': 'M4 21V9h7v12 M11 21V4h8v17 M2 21h20 M7 12v2 M14 8h2 M14 12h2 M14 16h2',
    '交通': 'M6 3h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z M4 11h16 M8 15h.01 M16 15h.01 M8 19l-2 3 M16 19l2 3',
  }
  return <span className={`place-icon ${category === '美食' ? 'food' : category === '交通' ? 'transit' : ''}`} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={paths[category] ?? 'M12 22s8-8 8-13a8 8 0 1 0-16 0c0 5 8 13 8 13Z M9 9a3 3 0 1 0 6 0 3 3 0 0 0-6 0'} /></svg></span>
}

function Branch({ className, title, subtitle, dropId, locations, onSelect, onOpenDay }: { className: string; title: string; subtitle?: string; dropId: string; locations: Poi[]; onSelect: (poiId: string) => void; onOpenDay?: () => void }) {
  const { isOver, setNodeRef } = useDroppable({ id: dropId })
  return <section className={`branch ${className} ${isOver ? 'is-drop-target' : ''}`} data-day={dropId.startsWith('day:') ? dropId.slice(4) : undefined} ref={setNodeRef}><h3><span>{title}</span>{onOpenDay && <button className="day-edit-link" type="button" onClick={onOpenDay}>编辑 ↗</button>}</h3>{subtitle && <p>{subtitle}</p>}<div className="branch-items">{locations.length ? locations.map((poi) => <DraggableBranchItem poi={poi} key={poi.id} onSelect={() => onSelect(poi.id)} />) : <span className="empty-branch">拖到这里安排</span>}</div></section>
}

function DraggableBranchItem({ poi, onSelect }: { poi: Poi; onSelect: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `arranged:${poi.id}`, data: { poiId: poi.id } })
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined
  return <button className={`branch-item ${statusClass(poi)} ${isDragging ? 'is-dragging' : ''}`} ref={setNodeRef} style={style} type="button" {...listeners} {...attributes} onClick={onSelect}>{poi.name}{poi.priority === 'must' && poi.scheduledDay && <span className="branch-priority">必去</span>}</button>
}

function DayEditor({ day, onBack, onChangeDay }: { day: number; onBack: () => void; onChangeDay: (day: number) => void }) {
  const { plan, dispatch } = usePlan()
  const [activePoiId, setActivePoiId] = useState<string | null>(null)
  const dayPois = orderedDayPois(plan, day)
  const transportSegments = plan.dayPlans.find((item) => item.day === day)?.transportSegments ?? []
  const linkedTransportPois = transportSegments.flatMap((segment) => segment.viaPoiId ? plan.pois.filter((poi) => poi.id === segment.viaPoiId && poi.category === '交通') : [])
    .filter((poi, index, list) => list.findIndex((item) => item.id === poi.id) === index)
  const dayMapPois = [...dayPois, ...linkedTransportPois.filter((poi) => !dayPois.some((dayPoi) => dayPoi.id === poi.id))]
  const unassignedPois = plan.pois.filter((poi) => poi.scheduledDay === null)
  const confirmedCount = dayMapPois.filter((poi) => poi.locationStatus === 'confirmed').length
  const markerLabels = Object.fromEntries(dayPois.map((poi, index) => [poi.id, String(index + 1)]))

  function selectPoi(poiId: string) {
    setActivePoiId(poiId)
  }

  function addToDay(poiId: string) {
    dispatch({ type: 'set-poi-arrangement', poiId, scheduledDay: day })
    setActivePoiId(poiId)
  }

  return <section className="day-editor-overlay" aria-label={`Day ${day} 单日编辑页`}>
    <header className="day-editor-header">
      <button className="back-to-overview" type="button" onClick={onBack}>← 返回总览</button>
      <div className="day-title"><h1>Day {day}</h1><span>{plan.cityName}</span><select aria-label="切换编辑日期" value={day} onChange={event => onChangeDay(Number(event.target.value))}>{Array.from({ length: plan.days }, (_, i) => <option key={i} value={i + 1}>Day {i + 1}</option>)}</select></div>
      <p>{dayPois.length} 个地点{linkedTransportPois.length ? ` · 关联 ${linkedTransportPois.length} 个交通节点` : ''} · 已确认 {confirmedCount} 个位置</p>
    </header>
    <main className="day-editor-content">
        <section className="day-editor-map" aria-label={`Day ${day} 地图`}>
          <div className="day-editor-section-heading"><div><h2>当日地图</h2></div><span>地点按行程编号</span></div>
          <AmapMap cityName={plan.cityName} pois={dayMapPois} focusedPoiId={activePoiId} highlightedPoiIds={null} markerLabels={markerLabels}
            onMarkerClick={selectPoi} onResetView={() => setActivePoiId(null)} />
          {!confirmedCount && <p className="day-map-empty-note">当前 Day 的地点尚未确认地图位置；仍可先在右侧编排行程。</p>}
        </section>
        <section className="day-timeline-panel" aria-label={`Day ${day} 今日行程`}>
          <div className="day-editor-section-heading"><div><h2>今日行程</h2></div><span>{dayPois.length} 站</span></div>
          <DayTimeline day={day} pois={dayPois} activePoiId={activePoiId} onSelectPoi={selectPoi} />
        </section>
        <section className="day-candidate-panel" aria-label="从未安排地点加入">
          <div className="day-editor-section-heading"><div><h2>从地点池加入</h2></div><span>{unassignedPois.length} 个</span></div>
          <div className="day-candidate-list">{unassignedPois.length ? unassignedPois.map((poi) => <article key={poi.id} className="day-candidate-card"><button type="button" aria-label={`查看${poi.name}`} onClick={() => addToDay(poi.id)}><b>{poi.name}</b><span>{poi.category}</span></button><button className="day-add-button" type="button" aria-label={`加入${poi.name}到Day ${day}`} onClick={() => addToDay(poi.id)}>＋ 加入</button></article>) : <p className="day-candidate-empty">所有地点都已有日期安排。</p>}</div>
        </section>
      </main>
  </section>
}

function DayTimeline({ day, pois, activePoiId, onSelectPoi }: { day: number; pois: Poi[]; activePoiId: string | null; onSelectPoi: (poiId: string) => void }) {
  const { plan, dispatch } = usePlan()
  const [draggingPoiId, setDraggingPoiId] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  const transportSegments = plan.dayPlans.find((item) => item.day === day)?.transportSegments ?? []
  const transportNodeCandidates = plan.pois.filter((poi) => poi.category === '交通' && (poi.scheduledDay === null || poi.scheduledDay === day))

  function handleDragEnd(event: DragEndEvent) {
    setDraggingPoiId(null)
    if (!event.over) return
    const draggedPoiId = String(event.active.data.current?.poiId ?? '')
    const targetPoiId = String(event.over.data.current?.poiId ?? '')
    if (!draggedPoiId || !targetPoiId || draggedPoiId === targetPoiId) return
    const poiIds = pois.map((poi) => poi.id)
    if (!poiIds.includes(draggedPoiId) || !poiIds.includes(targetPoiId)) return
    const withoutDragged = poiIds.filter((poiId) => poiId !== draggedPoiId)
    const targetIndex = withoutDragged.indexOf(targetPoiId)
    dispatch({ type: 'reorder-day-pois', day, poiIds: [...withoutDragged.slice(0, targetIndex), draggedPoiId, ...withoutDragged.slice(targetIndex)] })
  }

  return <DndContext sensors={sensors} onDragStart={(event) => setDraggingPoiId(String(event.active.data.current?.poiId ?? ''))} onDragCancel={() => setDraggingPoiId(null)} onDragEnd={handleDragEnd}>
    <div className="day-timeline-list">
      {pois.length ? pois.map((poi, index) => <Fragment key={poi.id}><DayTimelineItem poi={poi} index={index} selected={activePoiId === poi.id} isDragging={draggingPoiId === poi.id} onSelect={() => onSelectPoi(poi.id)} onChangeNote={(note) => dispatch({ type: 'set-poi-note', poiId: poi.id, note })} onChangePart={(dayPart) => dispatch({ type: 'set-poi-day-part', poiId: poi.id, dayPart })} />{pois[index + 1] && <TransportSegmentItem fromPoi={poi} toPoi={pois[index + 1]} transportNodes={transportNodeCandidates} segment={transportSegments.find((item) => item.fromPoiId === poi.id && item.toPoiId === pois[index + 1].id)} onChange={(change) => dispatch({ type: 'set-transport-segment', day, fromPoiId: poi.id, toPoiId: pois[index + 1].id, ...change })} />}</Fragment>) : <p className="day-timeline-empty">还没有安排地点。可以从下方的未安排地点加入。</p>}
    </div>
    <DragOverlay>{draggingPoiId ? <span className="day-drag-overlay">正在调整顺序</span> : null}</DragOverlay>
  </DndContext>
}

function TransportSegmentItem({ fromPoi, toPoi, transportNodes, segment, onChange }: { fromPoi: Poi; toPoi: Poi; transportNodes: Poi[]; segment?: TransportSegment; onChange: (change: { mode?: TransportMode | null; durationMinutes?: number | null; viaPoiId?: string | null }) => void }) {
  const [durationDraft, setDurationDraft] = useState(segment?.durationMinutes?.toString() ?? '')
  const [isEditing, setIsEditing] = useState(false)
  const via = transportNodes.find(poi => poi.id === segment?.viaPoiId)
  const summary = [segment?.mode ? transportModeLabels[segment.mode] : '添加交通', segment?.durationMinutes ? `${segment.durationMinutes} 分钟` : '', via?.name].filter(Boolean).join(' · ')

  function saveDuration() {
    const value = durationDraft.trim()
    if (!value) {
      onChange({ durationMinutes: null })
      return
    }
    const minutes = Number(value)
    if (Number.isInteger(minutes) && minutes >= 1 && minutes <= 1440) onChange({ durationMinutes: minutes })
  }

  return <div className="transport-segment" aria-label={`${fromPoi.name}到${toPoi.name}的交通段`}>
    <span className="transport-segment-line" aria-hidden="true">↓</span>
    <div className="transport-segment-body"><button className="transport-summary" type="button" aria-expanded={isEditing} onClick={() => { if (isEditing) saveDuration(); setIsEditing(!isEditing) }}><span>{summary}</span><small>{isEditing ? '收起' : '编辑'}</small></button>{isEditing && <div className="transport-segment-controls"><span className="transport-segment-route" title={`${fromPoi.name}前往${toPoi.name}`}>{fromPoi.name} → {toPoi.name}</span><select aria-label={`${fromPoi.name}到${toPoi.name}的交通节点`} value={segment?.viaPoiId ?? ''} onChange={(event) => onChange({ viaPoiId: event.target.value || null })}><option value="">不经节点</option>{transportNodes.map((poi) => <option key={poi.id} value={poi.id}>{poi.name} · {poi.transportType ?? '交通'}</option>)}</select><select aria-label={`${fromPoi.name}到${toPoi.name}的交通方式`} value={segment?.mode ?? ''} onChange={(event) => onChange({ mode: event.target.value ? event.target.value as TransportMode : null })}><option value="">待补充</option>{(Object.entries(transportModeLabels) as Array<[TransportMode, string]>).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><label className="transport-duration"><input aria-label={`${fromPoi.name}到${toPoi.name}的预计分钟数`} type="number" inputMode="numeric" min="1" max="1440" value={durationDraft} onChange={(event) => setDurationDraft(event.target.value)} onBlur={saveDuration} placeholder="分钟" /><span>分</span></label></div>}</div>
  </div>
}

function DayTimelineItem({ poi, index, selected, isDragging, onSelect, onChangeNote, onChangePart }: { poi: Poi; index: number; selected: boolean; isDragging: boolean; onSelect: () => void; onChangeNote: (note: string) => void; onChangePart: (dayPart: DayPart | null) => void }) {
  const [noteDraft, setNoteDraft] = useState(poi.note ?? '')
  const [isNoteEditing, setIsNoteEditing] = useState(false)
  const { attributes, listeners, setNodeRef: setDraggableRef, transform } = useDraggable({ id: `day-timeline:${poi.id}`, data: { poiId: poi.id } })
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({ id: `day-timeline-drop:${poi.id}`, data: { poiId: poi.id } })
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined

  function setNodeRef(node: HTMLElement | null) {
    setDraggableRef(node)
    setDroppableRef(node)
  }

  function savePoiNote() {
    if (noteDraft.trim() !== (poi.note ?? '')) onChangeNote(noteDraft)
  }

  return <article className={`day-timeline-item ${selected ? 'is-selected' : ''} ${isDragging ? 'is-dragging' : ''} ${isOver && !isDragging ? 'is-drag-over' : ''}`} ref={setNodeRef} style={style}>
    <button className="day-timeline-main" type="button" onClick={onSelect}><span className="day-drag-handle" {...listeners} {...attributes} aria-label={`拖拽${poi.name}调整顺序`} title="拖拽调整顺序">⠿</span><span className="day-order-number">{index + 1}</span><span><b>{poi.name}</b><small>{poi.priority === 'must' ? '必去' : poi.priority === 'maybe' ? '待定' : poi.category}</small></span></button>
    <div className="day-timeline-actions"><select className="day-part-select" aria-label={`${poi.name}的时段`} value={poi.dayPart ?? ''} onChange={event => onChangePart(event.target.value ? event.target.value as DayPart : null)}><option value="">时段未定</option>{(Object.entries(dayPartLabels) as Array<[DayPart, string]>).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
    <div className="timeline-note">{isNoteEditing ? <label><span className="sr-only">{poi.name}的备注</span><textarea autoFocus aria-label={`${poi.name}的备注`} value={noteDraft} onChange={event => setNoteDraft(event.target.value)} onBlur={() => { savePoiNote(); setIsNoteEditing(false) }} onKeyDown={event => { if (event.key === 'Escape') { setNoteDraft(poi.note ?? ''); setIsNoteEditing(false) } }} maxLength={300} placeholder="想在这里做什么？" /></label> : <button type="button" aria-label={`编辑${poi.name}的备注`} onClick={() => setIsNoteEditing(true)} title={poi.note || '添加玩法、打卡或提醒'}>{poi.note || '＋ 添加备注'}</button>}</div>
  </article>
}

function CandidateSection({ title, candidates, onChange, isTransport = false }: { title: string; candidates: ReviewCandidate[]; onChange: React.Dispatch<React.SetStateAction<ReviewCandidate[]>>; isTransport?: boolean }) {
  return <section className={isTransport ? 'candidate-section transport-section' : 'candidate-section'}><h3>{title}</h3>{candidates.map((candidate) => <div className="candidate-row" key={candidate.id}><input className="candidate-check" type="checkbox" aria-label={`加入${candidate.name}`} checked={candidate.selected} onChange={(event) => onChange((current) => current.map((item) => item.id === candidate.id ? { ...item, selected: event.target.checked } : item))} /><input aria-label="地点候选名称" value={candidate.name} onChange={(event) => onChange((current) => current.map((item) => item.id === candidate.id ? { ...item, name: event.target.value } : item))} /><select aria-label={`${candidate.name}的类别`} value={isTransport ? candidate.transportType ?? '其他' : candidate.category} onChange={(event) => onChange((current) => current.map((item) => item.id === candidate.id ? isTransport ? { ...item, category: '交通', transportType: event.target.value as TransportType } : { ...item, category: event.target.value as PoiCategory } : item))}>{(isTransport ? transportTypes : placeCategories).map((category) => <option key={category} value={category}>{category}</option>)}</select><button type="button" aria-label={`移除${candidate.name}`} onClick={() => onChange((current) => current.filter((item) => item.id !== candidate.id))}>移除</button>{candidate.evidence && <p className="candidate-evidence">原文：{candidate.evidence}</p>}</div>)}</section>
}

function PoiDetailDialog({ poi, onClose, onConfirmLocation }: { poi: Poi; onClose: () => void; onConfirmLocation: () => void }) {
  const { plan, dispatch } = usePlan()
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftUrl, setDraftUrl] = useState('')
  const [sourceError, setSourceError] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState(poi.note ?? '')

  function startEditing(index: number) {
    const source = poi.sources[index]
    setSourceError(null)
    setEditingIndex(index)
    setDraftTitle(source.title)
    setDraftUrl(source.url ?? '')
  }

  function saveSource() {
    if (editingIndex === null) return
    if (draftUrl.trim()) {
      try {
        const url = new URL(draftUrl.trim())
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid protocol')
      } catch {
        setSourceError('请填写完整的 http:// 或 https:// 链接，或留空。')
        return
      }
    }
    dispatch({ type: 'update-poi-source', poiId: poi.id, sourceIndex: editingIndex, title: draftTitle, url: draftUrl })
    setSourceError(null)
    setEditingIndex(null)
  }

  function saveNote() {
    if (noteDraft.trim() !== (poi.note ?? '')) dispatch({ type: 'set-poi-note', poiId: poi.id, note: noteDraft })
  }

  const locationLabel = poi.locationStatus === 'confirmed' ? `已确认${poi.address ? ` · ${poi.address}` : ''}` : poi.locationStatus === 'unavailable' ? '暂不定位' : '待确认'

  return <div className="map-poi-card"><section className="day-picker poi-detail-dialog" role="dialog" aria-modal="false" aria-label={`${poi.name}的地点详情`} onClick={(event) => event.stopPropagation()}><button className="poi-card-close" type="button" aria-label="关闭地点详情" onClick={() => { saveNote(); onClose() }}>×</button><div><p className="eyebrow">地点详情</p><h2>{poi.name}</h2></div><p className="poi-meta">{poi.category}{poi.category === '交通' ? ` · ${poi.transportType ?? '其他'}` : ''} · 已收录 {poi.sources.length} 条攻略来源</p><section className="poi-quick-arrangement"><p>安排日期</p><div className="quick-day-options">{[{ day: null, label: '未安排' }, ...Array.from({ length: plan.days }, (_, i) => ({ day: i + 1, label: `Day ${i + 1}` }))].map((option) => <button type="button" key={option.label} aria-pressed={poi.scheduledDay === option.day} onClick={() => dispatch({ type: 'set-poi-arrangement', poiId: poi.id, scheduledDay: option.day })}>{option.label}</button>)}</div><label>优先级<select value={poi.priority} onChange={(event) => dispatch({ type: 'set-poi-arrangement', poiId: poi.id, priority: event.target.value as PoiPriority })}><option value="normal">普通</option><option value="must">必去</option><option value="maybe">待定</option></select></label></section><section className="location-card"><div><span>地图位置</span><b>{locationLabel}</b></div><button type="button" onClick={onConfirmLocation}>{poi.locationStatus === 'confirmed' ? '重新确认' : '确认位置'}</button></section><section className="poi-note-card"><label htmlFor={`poi-note-${poi.id}`}>我的备注</label><textarea id={`poi-note-${poi.id}`} value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} onBlur={saveNote} maxLength={300} placeholder="例如：傍晚去看日落；打卡临湖机位；记得提前预约。" /><small>离开输入框后自动保存</small></section>{sourceError && <p className="import-error" role="alert">{sourceError}</p>}<details className="source-details"><summary><span>攻略来源</span><small>{poi.sources.length} 条 · 展开查看</small></summary><div className="source-list">{poi.sources.length ? poi.sources.map((source, index) => <article className="source-record" key={`${source.importedAt}-${index}`}>{editingIndex === index ? <><label>攻略标题<input aria-label="来源标题" value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} /></label><label>原帖链接（可不填）<input aria-label="来源链接" type="url" value={draftUrl} onChange={(event) => setDraftUrl(event.target.value)} placeholder="https://www.xiaohongshu.com/..." /></label><div className="source-actions"><button type="button" className="source-save" onClick={saveSource}>保存</button><button type="button" onClick={() => setEditingIndex(null)}>取消</button></div></> : <><b>{source.title}</b><span>{source.method === 'text' ? '粘贴文字' : source.method === 'manual' ? '手动添加' : '链接导入'} · {new Date(source.importedAt).toLocaleDateString('zh-CN')}</span>{source.url && <a href={source.url} target="_blank" rel="noreferrer">打开原笔记</a>}<div className="source-actions"><button type="button" onClick={() => startEditing(index)}>编辑</button><button className="source-delete" type="button" onClick={() => dispatch({ type: 'remove-poi-source', poiId: poi.id, sourceIndex: index })}>删除</button></div></>}</article>) : <p className="empty-branch">还没有来源记录。</p>}</div></details><div className="dialog-actions"><button className="primary-button" type="button" onClick={onClose}>完成 <span>→</span></button></div></section></div>
}

function MapLocationDialog({ poi, cityName, cityAdcode, isStaticDemo, onClose }: { poi: Poi; cityName: string; cityAdcode: string; isStaticDemo: boolean; onClose: () => void }) {
  const { dispatch } = usePlan()
  const [results, setResults] = useState<MapPoiCandidate[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function findCandidates() {
    if (isStaticDemo) {
      setError('公开演示版不提供在线地点搜索。你仍可保留地点并完成路线整理；完整线上版会在服务端安全查询候选位置。')
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      setResults(await searchMapPois(poi.name, cityAdcode))
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : '地点搜索暂时不可用，请稍后重试。')
    } finally {
      setIsLoading(false)
    }
  }

  function confirmCandidate(candidate: MapPoiCandidate) {
    dispatch({ type: 'confirm-poi-location', poiId: poi.id, ...candidate, address: [candidate.district, candidate.address].filter(Boolean).join(' ') })
    onClose()
  }

  return <div className="day-picker-backdrop" onClick={onClose}><section className="day-picker location-dialog" role="dialog" aria-modal="true" aria-label={`确认${poi.name}的位置`} onClick={(event) => event.stopPropagation()}><div><p className="eyebrow">确认地图位置</p><h2>{poi.name}</h2></div><p className="dialog-copy">将在「{cityName}」内搜索。请从候选中手动选择准确地点；未确认前不会加入地图标记。</p>{results.length === 0 && !isLoading && <button className="primary-button location-search-button" type="button" onClick={findCandidates}>搜索候选 <span>→</span></button>}{isLoading && <p className="location-feedback">正在搜索地点…</p>}{error && <p className="import-error" role="alert">{error}</p>}{results.length > 0 && <div className="location-results">{results.map((candidate) => <button type="button" className="location-result" key={candidate.mapPoiId} onClick={() => confirmCandidate(candidate)}><b>{candidate.name}</b><span>{[candidate.district, candidate.address].filter(Boolean).join(' · ') || '高德未提供详细地址'}</span><small>确认这个地点 →</small></button>)}</div>}<div className="dialog-actions"><button className="subtle-button" type="button" onClick={() => { dispatch({ type: 'mark-poi-location-unavailable', poiId: poi.id }); onClose() }}>暂不定位</button><button className="subtle-button" type="button" onClick={onClose}>取消</button></div></section></div>
}

function SourceLibraryDialog({ onClose, onFallback, onDelete }: { onClose: () => void; onFallback: (source: SourceRecord) => void; onDelete: (source: SourceRecord) => void }) {
  const { plan } = usePlan()
  return <div className="day-picker-backdrop" onClick={onClose}><section className="day-picker source-library-dialog" role="dialog" aria-modal="true" aria-label="攻略来源库" onClick={(event) => event.stopPropagation()}><div><p className="eyebrow">攻略来源库</p><h2>每一篇攻略，<br />都留得住。</h2></div><p className="dialog-copy">链接内容尚未接入已授权读取服务时，也会完整保留在这里；补贴文字后可继续提取地点。</p><div className="source-library-list">{plan.sourceLibrary.length ? plan.sourceLibrary.map((source) => { const relatedPois = plan.pois.filter((poi) => poi.sources.some((item) => isSourceFromRecord(item, source))); return <article className="source-library-card" key={source.id}><div><span className={`parse-status ${source.parseStatus}`}>{source.parseStatus === 'failed' ? '等待补充文字' : source.parseStatus === 'text_only' ? '已用文字整理' : '已整理'}</span><b>{source.title}</b><small>{relatedPois.length} 个关联地点 · {new Date(source.importedAt).toLocaleDateString('zh-CN')}</small>{source.failureReason && <p>{source.failureReason}</p>}{source.url && <a href={source.url} target="_blank" rel="noreferrer">打开原笔记 ↗</a>}</div><div className="source-library-actions">{source.parseStatus === 'failed' && <button className="primary-button" type="button" onClick={() => onFallback(source)}>粘贴文字继续 <span>→</span></button>}{relatedPois.length > 0 && <span>{relatedPois.map((poi) => poi.name).join(' · ')}</span>}<button className="source-record-delete" type="button" onClick={() => onDelete(source)}>删除来源</button></div></article> }) : <p className="empty-branch">还没有保存的攻略来源。导入文字或链接后会出现在这里。</p>}</div><div className="dialog-actions"><button className="primary-button" type="button" onClick={onClose}>完成 <span>→</span></button></div></section></div>
}

function DeleteSourceDialog({ source, orphanedPoiCount, onClose }: { source: SourceRecord; orphanedPoiCount: number; onClose: () => void }) {
  const { dispatch } = usePlan()
  return <div className="day-picker-backdrop" onClick={onClose}><section className="day-picker delete-source-dialog" role="dialog" aria-modal="true" aria-label={`删除${source.title}`} onClick={(event) => event.stopPropagation()}><div><p className="eyebrow">删除攻略来源</p><h2>确认删除这篇攻略？</h2></div><p className="dialog-copy">将删除「{source.title}」这篇来源，并移除它与地点的关联。</p><p className="delete-source-warning">其中 {orphanedPoiCount} 个地点没有其他攻略来源，会一并从当前旅行计划中删除；有其他来源的地点会保留。</p><div className="dialog-actions"><button className="subtle-button" type="button" onClick={onClose}>取消</button><button className="danger-button" type="button" onClick={() => { dispatch({ type: 'delete-source-record-and-orphaned-pois', source }); onClose() }}>删除来源和唯一地点</button></div></section></div>
}

function makeSourceRecord(input: Omit<SourceRecord, 'id' | 'importedAt'>): SourceRecord {
  return { ...input, id: `source-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, importedAt: new Date().toISOString() }
}

function isXiaohongshuUrl(value: string) {
  try {
    const hostname = new URL(value).hostname.toLowerCase()
    return hostname === 'xiaohongshu.com' || hostname.endsWith('.xiaohongshu.com')
      || hostname === 'xhslink.com' || hostname.endsWith('.xhslink.com')
      || hostname === 'xhslink.cn' || hostname.endsWith('.xhslink.cn')
  } catch {
    return false
  }
}

function extractXiaohongshuLinks(value: string) {
  const matches = value.match(/https?:\/\/[^\s<>{}，。、】【】]+/g) ?? []
  return [...new Set(matches.map((link) => link.replace(/[),.!?;:]+$/, '')).filter(isXiaohongshuUrl))]
}

function extractSharedTitle(value: string) {
  const urlStart = value.search(/https?:\/\//)
  if (urlStart <= 0) return ''
  return value.slice(0, urlStart).replace(/\s+/g, ' ').trim().slice(0, 80)
}

function isSourceFromRecord(source: { title: string; url: string | null }, record: SourceRecord) {
  return source.title === record.title && source.url === record.url
}

export default App
