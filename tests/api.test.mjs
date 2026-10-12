import test from 'node:test'
import assert from 'node:assert/strict'
import { handleApi, validateAiCandidates } from '../server/api.mjs'
const post = (path, body) => new Request('http://localhost/api/' + path, { method: 'POST', body: JSON.stringify(body) })
const fakeJson = data => async () => new Response(JSON.stringify(data))
test('未配置 AI 时诚实降级，config 不泄露密钥', async () => {
  const config = await handleApi(new Request('http://localhost/api/config'), { AMAP_WEB_SERVICE_KEY: 'hidden' })
  assert.deepEqual(await config.json(), { aiAvailable: false, mapSearchAvailable: true })
  const result = await handleApi(post('extract-pois', { text: '游西湖', cityName: '杭州' }))
  assert.equal(result.status, 503)
})
test('无效城市编码不发外部请求', async () => {
  const result = await handleApi(post('poi-search', { name: '西湖', cityAdcode: 'pending' }), { AMAP_WEB_SERVICE_KEY: 'hidden' }, { fetcher: () => { throw Error('must not call') } })
  assert.equal(result.status, 400)
})
test('高德服务错误不能被当成零结果成功', async () => {
  const result = await handleApi(post('poi-search', { name: '西湖', cityAdcode: '330100' }), { AMAP_WEB_SERVICE_KEY: 'hidden' }, { fetcher: fakeJson({ status: '0', info: 'INVALID_KEY' }) })
  assert.equal(result.status, 502)
  assert.ok(!(await result.text()).includes('hidden'))
})
test('地点响应过滤无坐标候选并限制数量', async () => {
  const result = await handleApi(post('poi-search', { name: '西湖', cityAdcode: '330100' }), { AMAP_WEB_SERVICE_KEY: 'hidden' }, { fetcher: fakeJson({ status: '1', pois: [{ id: '1', name: '西湖', location: '120.1,30.2' }, { id: '2', name: '坏数据' }] }) })
  assert.equal((await result.json()).results.length, 1)
})
test('城市查询拒绝省级和非大陆结果', async () => {
  const result = await handleApi(post('city-search', { name: '嘉兴市' }), { AMAP_WEB_SERVICE_KEY: 'hidden' }, { fetcher: fakeJson({ status: '1', districts: [{ name: '嘉兴市', adcode: '330400', level: 'city' }, { name: '浙江省', adcode: '330000', level: 'province' }, { name: '香港', adcode: '810000', level: 'city' }] }) })
  assert.deepEqual((await result.json()).cities, [{ name: '嘉兴市', adcode: '330400' }])
})
test('AI 证据必须来自原文，去重并过滤幻觉', () => {
  const candidates = validateAiCandidates({ pois: [
    { name: '西湖', category: '景点', evidence: '晚上去西湖' },
    { name: '西湖', category: '景点', evidence: '晚上去西湖' },
    { name: '故宫', category: '景点', evidence: '去故宫' },
    { name: '凤起路站', category: '交通', transportType: '地铁站', evidence: '凤起路站出站' },
  ] }, '晚上去西湖，凤起路站出站')
  assert.deepEqual(candidates.map(item => item.name), ['西湖', '凤起路站'])
})
test('模型接口配置后实际走请求与校验流程', async () => {
  const result = await handleApi(post('extract-pois', { text: '去西湖', cityName: '杭州' }), { AI_API_KEY: 'hidden', AI_MODEL: 'test', AI_BASE_URL: 'https://example.org/v1' }, { fetcher: async (url, options) => {
    assert.equal(url.href, 'https://example.org/v1/chat/completions')
    assert.equal(options.headers.Authorization, 'Bearer hidden')
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ pois: [{ name: '西湖', category: '景点', evidence: '去西湖' }] }) } }] }))
  } })
  assert.equal(result.status, 200)
  assert.equal((await result.json()).candidates[0].name, '西湖')
})
test('输入大小、方法和格式校验', async () => {
  assert.equal((await handleApi(new Request('http://localhost/api/poi-search'))).status, 405)
  assert.equal((await handleApi(post('poi-search', null))).status, 400)
  assert.equal((await handleApi(post('poi-search', { name: 'x'.repeat(40000) }))).status, 400)
})
