import { useEffect, useRef, useState } from 'react'
import type { Poi } from '../plan/types'

type Position = [number, number]

type AMapMarker = {
  setMap: (map: AMapInstance | null) => void
  on: (event: 'click', handler: () => void) => void
}

type AMapInstance = {
  destroy: () => void
  setCity: (city: string) => void
  setZoom?: (zoom: number) => void
  setZoomAndCenter?: (zoom: number, center: Position) => void
  setFitView?: (overlays: AMapMarker[], immediately?: boolean, avoid?: [number, number, number, number]) => void
}

type AMapConstructor = {
  Map: new (container: HTMLElement, options: { city: string; zoom: number; viewMode: '2D' }) => AMapInstance
  Marker: new (options: { position: Position; content: string; offset?: [number, number]; zIndex?: number }) => AMapMarker
}

declare global {
  interface Window {
    AMap?: AMapConstructor
    _AMapSecurityConfig?: { securityJsCode: string }
  }
}

let amapLoadPromise: Promise<AMapConstructor> | null = null

function loadAmap(key: string, securityJsCode: string) {
  if (window.AMap) return Promise.resolve(window.AMap)
  if (amapLoadPromise) return amapLoadPromise

  window._AMapSecurityConfig = { securityJsCode }
  amapLoadPromise = new Promise<AMapConstructor>((resolve, reject) => {
    const requestScript = (attempt: number) => {
      const script = document.createElement('script')
      script.async = true
      script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}`
      script.onload = () => {
        if (window.AMap) {
          resolve(window.AMap)
          return
        }
        script.remove()
        amapLoadPromise = null
        reject(new Error('地图脚本已加载，但地图服务不可用。'))
      }
      script.onerror = () => {
        script.remove()
        if (attempt === 0) {
          window.setTimeout(() => requestScript(1), 400)
          return
        }
        amapLoadPromise = null
        reject(new Error('地图脚本加载失败，请检查网络与 Key 配置。'))
      }
      document.head.append(script)
    }
    requestScript(0)
  })
  return amapLoadPromise
}

function markerTone(poi: Poi) {
  if (poi.priority === 'must') return 'must'
  if (poi.priority === 'maybe') return 'maybe'
  if (poi.scheduledDay) return 'day'
  return 'normal'
}

function markerOffset(poi: Poi, index: number, confirmedPois: Poi[]): [number, number] {
  const nearbyIndex = confirmedPois.slice(0, index).filter((other) => Math.abs(other.longitude! - poi.longitude!) < 0.0012 && Math.abs(other.latitude! - poi.latitude!) < 0.0012).length
  const stagger: [number, number][] = [[0, 0], [-16, -16], [16, -16], [-16, 16], [16, 16], [0, -24]]
  const [shiftX, shiftY] = stagger[nearbyIndex % stagger.length]
  const anchor: [number, number] = poi.category === '交通' ? [-29, -12] : [-17, -17]
  return [anchor[0] + shiftX, anchor[1] + shiftY]
}

function SchematicMap({ cityName, pois, focusedPoiId, highlightedPoiIds, markerLabels, onMarkerClick }: { cityName: string; pois: Poi[]; focusedPoiId: string | null; highlightedPoiIds: string[] | null; markerLabels?: Record<string, string>; onMarkerClick: (poiId: string) => void }) {
  const confirmedPois = pois.filter((poi) => poi.locationStatus === 'confirmed' && Number.isFinite(poi.longitude) && Number.isFinite(poi.latitude))
  const highlighted = highlightedPoiIds ? new Set(highlightedPoiIds) : null
  const longitudes = confirmedPois.map((poi) => poi.longitude!)
  const latitudes = confirmedPois.map((poi) => poi.latitude!)
  const minLng = Math.min(...longitudes)
  const maxLng = Math.max(...longitudes)
  const minLat = Math.min(...latitudes)
  const maxLat = Math.max(...latitudes)
  const lngRange = Math.max(maxLng - minLng, 0.008)
  const latRange = Math.max(maxLat - minLat, 0.008)

  return <section className="schematic-map" aria-label={`${cityName}地点示意图`}>
    <div className="schematic-map-water" aria-hidden="true" />
    <div className="schematic-map-terrain terrain-one" aria-hidden="true" />
    <div className="schematic-map-terrain terrain-two" aria-hidden="true" />
    <div className="schematic-map-grid" aria-hidden="true" />
    <div className="schematic-map-header"><span>地点示意</span><strong>{cityName}</strong></div>
    {confirmedPois.length ? <div className="schematic-marker-layer">
      {confirmedPois.map((poi) => {
        const left = 12 + ((poi.longitude! - minLng) / lngRange) * 76
        const top = 14 + (1 - (poi.latitude! - minLat) / latRange) * 68
        const label = markerLabels?.[poi.id] ?? poi.name.slice(0, 4)
        const dimmed = highlighted && !highlighted.has(poi.id) && focusedPoiId !== poi.id
        return <button key={poi.id} type="button" className={`schematic-marker ${markerTone(poi)} ${poi.category === '交通' ? 'transport' : ''} ${focusedPoiId === poi.id ? 'is-focused' : ''} ${dimmed ? 'is-dimmed' : ''}`} style={{ left: `${left}%`, top: `${top}%` }} onClick={() => onMarkerClick(poi.id)} aria-label={`查看${poi.name}`}><span>{label}</span></button>
      })}
    </div> : <div className="schematic-empty"><b>还没有已定位地点</b><span>确认地点位置后，会在这里显示它们的相对分布。</span></div>}
    <div className="schematic-map-note"><span>示意地图</span><p>不含道路与导航；配置地图服务后显示真实底图。</p></div>
  </section>
}

export function AmapMap({ cityName, pois, focusedPoiId, highlightedPoiIds, markerLabels, onMarkerClick, onResetView }: { cityName: string; pois: Poi[]; focusedPoiId: string | null; highlightedPoiIds: string[] | null; markerLabels?: Record<string, string>; onMarkerClick: (poiId: string) => void; onResetView: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<AMapInstance | null>(null)
  const amapRef = useRef<AMapConstructor | null>(null)
  const markersRef = useRef<AMapMarker[]>([])
  const clickRef = useRef(onMarkerClick)
  useEffect(() => { clickRef.current = onMarkerClick }, [onMarkerClick])
  const highlightKey = highlightedPoiIds === null ? null : JSON.stringify(highlightedPoiIds)
  const markerLabelKey = markerLabels ? JSON.stringify(markerLabels) : null
  const focusedPoi = pois.find((poi) => poi.id === focusedPoiId && poi.locationStatus === 'confirmed')
  const focusLongitude = focusedPoi?.longitude
  const focusLatitude = focusedPoi?.latitude
  const [error, setError] = useState<string | null>(null)
  const [isMapReady, setIsMapReady] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  const key = import.meta.env.VITE_AMAP_JS_KEY as string | undefined
  const securityJsCode = import.meta.env.VITE_AMAP_SECURITY_JS_CODE as string | undefined
  const isConfigured = Boolean(key && securityJsCode)
  const useSchematicFallback = !isConfigured || import.meta.env.VITE_STATIC_DEMO === 'true'

  useEffect(() => {
    if (useSchematicFallback || !containerRef.current) return
    let cancelled = false
    setError(null)
    loadAmap(key!, securityJsCode!)
      .then((AMap) => {
        if (cancelled || !containerRef.current) return
        mapRef.current?.destroy()
        markersRef.current = []
        amapRef.current = AMap
        mapRef.current = new AMap.Map(containerRef.current, { city: cityName, zoom: 11, viewMode: '2D' })
        mapRef.current.setCity(cityName)
        setIsMapReady(true)
      })
      .catch((loadError: Error) => !cancelled && setError(loadError.message))
    return () => {
      cancelled = true
      mapRef.current?.destroy()
      mapRef.current = null
      amapRef.current = null
      markersRef.current = []
      setIsMapReady(false)
    }
  }, [cityName, key, reloadToken, securityJsCode, useSchematicFallback])

  useEffect(() => {
    const map = mapRef.current
    const AMap = amapRef.current
    if (!map || !AMap || !isMapReady) return

    markersRef.current.forEach((marker) => marker.setMap(null))
    const highlighted = highlightKey === null ? null : new Set<string>(JSON.parse(highlightKey))
    const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
    const confirmedPois = pois.filter((poi) => poi.locationStatus === 'confirmed' && Number.isFinite(poi.longitude) && Number.isFinite(poi.latitude))
    markersRef.current = confirmedPois.map((poi, index) => {
      const isTransport = poi.category === '交通'
      const markerLabel = markerLabels?.[poi.id] ?? poi.name.slice(0, 4)
      const marker = new AMap.Marker({
        position: [poi.longitude!, poi.latitude!],
        content: `<button class="trip-map-marker ${isTransport ? 'transport' : ''} ${markerTone(poi)} ${focusedPoiId === poi.id ? 'is-focused' : ''} ${highlighted && !highlighted.has(poi.id) && focusedPoiId !== poi.id ? 'is-dimmed' : ''} ${markerLabels?.[poi.id] ? 'numbered' : ''}" aria-label="查看${escapeHtml(poi.name)}"><span>${escapeHtml(markerLabel)}</span></button>`,
        offset: markerOffset(poi, index, confirmedPois),
        zIndex: focusedPoiId === poi.id ? 120 : 100,
      })
      marker.on('click', () => clickRef.current(poi.id))
      marker.setMap(map)
      return marker
    })

    return () => markersRef.current.forEach((marker) => marker.setMap(null))
  }, [pois, focusedPoiId, isMapReady, highlightKey, markerLabelKey])

  // Camera movement is independent of notes, scheduling and group styling.
  useEffect(() => {
    if (isMapReady && Number.isFinite(focusLongitude) && Number.isFinite(focusLatitude)) {
      mapRef.current?.setZoomAndCenter?.(18, [focusLongitude!, focusLatitude!])
    }
  }, [focusedPoiId, focusLongitude, focusLatitude, isMapReady])

  function resetView() {
    const map = mapRef.current
    if (!map) return

    if (markersRef.current.length > 1 && map.setFitView) {
      map.setFitView(markersRef.current, false, [36, 36, 36, 36])
    } else {
      map.setCity(cityName)
      map.setZoom?.(11)
    }
    onResetView()
  }

  if (useSchematicFallback) {
    return <SchematicMap cityName={cityName} pois={pois} focusedPoiId={focusedPoiId} highlightedPoiIds={highlightedPoiIds} markerLabels={markerLabels} onMarkerClick={onMarkerClick} />
  }

  if (error) return <div className="map-empty-state map-error"><span className="map-compass">!</span><div><b>地图暂时无法加载</b><p>{error}</p><button className="map-reload-button" type="button" onClick={() => { setError(null); setReloadToken((token) => token + 1) }}>重新加载地图</button></div></div>

  return <div className="amap-shell"><div className="amap-container" ref={containerRef} aria-label={`${cityName}地图`} />{focusedPoiId && <button className="map-overview-control" type="button" onClick={resetView} title="缩小查看所有已确认地点">⌖ <span>全览地点</span></button>}</div>
}
