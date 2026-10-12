import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
const secretNames = ['AMAP_WEB_SERVICE_KEY', 'AI_API_KEY']
const envPath = '.env.local'
const env = existsSync(envPath) ? Object.fromEntries(readFileSync(envPath, 'utf8').split(/\r?\n/).filter(line => line && !line.startsWith('#')).map(line => { const index = line.indexOf('='); return [line.slice(0, index), line.slice(index + 1).trim().replace(/^["']|["']$/g, '')] })) : {}
const secrets = secretNames.map(name => env[name]).filter(value => value && value.length > 8)
let violations = []
function scan(folder, built = false) {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name.startsWith('.env') || entry.name === 'artifacts') continue
    const path = join(folder, entry.name)
    if (entry.isDirectory()) { scan(path, built || entry.name === 'dist'); continue }
    if (/\.(jpg|png|webp|zip|gz)$/.test(entry.name)) continue
    const text = readFileSync(path, 'utf8')
    if (secrets.some(secret => text.includes(secret))) violations.push(path)
    if (built && /Authorization:\s*['"]Bearer\s+[a-zA-Z0-9_-]{16,}/.test(text)) violations.push(path)
  }
}
scan('.')
if (violations.length) { console.error('发现服务端密钥可能进入文件：', violations.join(', ')); process.exit(1) }
console.log('发布检查通过：源码和构建中未发现本地服务端密钥值。')
