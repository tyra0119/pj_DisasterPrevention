// headless Chrome + CDP でスクリーンショットを撮る。依存なし (Node 22 の WebSocket)。
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const OUT = process.argv[2]
const BASE = 'http://localhost:8080/'
const PROFILE = join(process.env.TEMP, 'shoot-profile')
mkdirSync(OUT, { recursive: true })

const HERE = JSON.stringify({ lat: 35.6885, lon: 139.699, geo: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const SHOTS = [
  { file: '01_verdict_en', q: 'lang=en&scenario=tokyo-5minus&home=35.6885,139.6990&homeName=Shinjuku&flight=NRT&dep=2026-09-07T10:40' },
  { file: '02_lines_en', q: 'lang=en&scenario=tokyo-5minus&home=35.6885,139.6990&homeName=Shinjuku&flight=NRT&dep=2026-09-07T10:40',
    act: `document.querySelector('[data-toggle=home]').click(); await new Promise(r=>setTimeout(r,300)); document.querySelector('.lnrow')?.click();`, scroll: '[data-toggle=home]' },
  { file: '03_avoid_en', q: 'lang=en&scenario=tokyo-6plus&home=35.6812,139.7671&homeName=Tokyo&flight=NRT&dep=2026-09-07T10:40' },
  { file: '04_shelter_en', q: 'lang=en&scenario=tokyo-6plus&home=35.6812,139.7671&homeName=Tokyo&flight=NRT&dep=2026-09-07T10:40',
    act: `document.querySelector('[data-toggle=shelter]').click(); await new Promise(r=>setTimeout(r,4000)); `, wait: 3000, scroll: '[data-toggle=shelter]' },
  { file: '05_quakemap_en', q: 'lang=en&scenario=tokyo-6plus&home=35.6812,139.7671&homeName=Tokyo&flight=NRT&dep=2026-09-07T10:40',
    act: `document.querySelector('.mapbtn').click(); await new Promise(r=>setTimeout(r,3000));`, wait: 2000, scroll: '.mapbtn' },
  { file: '06_settings_en', q: 'lang=en&scenario=tokyo-5minus&home=35.6885,139.6990&homeName=Shinjuku&flight=NRT&dep=2026-09-07T10:40',
    act: `[...document.querySelectorAll('button')].find(b=>/settings/i.test(b.textContent)).click();`, wait: 800 },
  { file: '07_verdict_ja', q: 'lang=ja&scenario=tokyo-5minus&home=35.6885,139.6990&homeName=%E6%96%B0%E5%AE%BF&flight=NRT&dep=2026-09-07T10:40' },
  { file: '08_verdict_zh', q: 'lang=zh&scenario=tokyo-5minus&home=35.6885,139.6990&homeName=Shinjuku&flight=NRT&dep=2026-09-07T10:40' },
  { file: '08_verdict_ko', q: 'lang=ko&scenario=tokyo-5minus&home=35.6885,139.6990&homeName=Shinjuku&flight=NRT&dep=2026-09-07T10:40' },
  { file: '09_real_event_ja', q: 'lang=ja&event=6a89d870e88ee598246bf24d&home=35.6812,139.7671&homeName=%E6%9D%B1%E4%BA%AC&flight=HND',
    act: `document.querySelector('[data-toggle=home]').click();`, wait: 500, scroll: '.verdict' },
]

const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=9333', `--user-data-dir=${PROFILE}`,
  '--no-first-run', '--hide-scrollbars', '--window-size=390,900', '--lang=ja', 'about:blank',
], { stdio: 'ignore' })
await sleep(2500)

const list = await (await fetch('http://127.0.0.1:9333/json')).json()
const page = list.find((t) => t.type === 'page')
console.log('targets', list.map((t) => t.type + ':' + t.url).join(' '))
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))
let id = 0
const pending = new Map()
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data)
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) }
}
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: `(async()=>{${expr}})()`, awaitPromise: true, returnByValue: true })).result?.value

await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' })

// 現在地を仕込む (同一オリジンで一度開く)
await send('Page.navigate', { url: BASE + 'diagnostics.html' })
await sleep(1500)
await evaluate(`localStorage.setItem('here', '${HERE.replace(/'/g, "\\'")}'); localStorage.removeItem('config');`)

for (const s of SHOTS) {
  await send('Page.navigate', { url: BASE + '?' + s.q })
  await sleep(9000)
  // 赤いテスト帯は画面の 1/4 を食う。資料用は隠す (本物の画面では出る。05 の注意書きに書いた)
  if (s.act) await evaluate(s.act)
  await evaluate(`const tb=document.querySelector('.testbar'); if(tb) tb.style.display='none'`)
  await sleep(s.wait ?? 500)
  await evaluate(s.scroll ? `document.querySelector('${s.scroll}')?.scrollIntoView({block:'start'})` : `window.scrollTo(0,0)`)
  await sleep(300)
  const status = await evaluate(`return document.querySelector('.v-status')?.textContent`)
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  if (!shot.result) { console.log('capture failed', JSON.stringify(shot).slice(0,200)); continue }
  const { data } = shot.result
  writeFileSync(join(OUT, s.file + '.png'), Buffer.from(data, 'base64'))
  console.log(s.file, '→', status)
}
ws.close()
chrome.kill()
