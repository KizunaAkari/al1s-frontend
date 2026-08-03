import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const chromePath = process.argv[2] || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const pageUrl = process.argv[3] || 'http://127.0.0.1:8000/editor/tronlong-rk3576-01'
const screenshotPath = path.resolve(process.argv[4] || 'artifacts/browser/script-manager-smoke.png')
const manualScreenshotPath = path.join(
  path.dirname(screenshotPath),
  `${path.basename(screenshotPath, path.extname(screenshotPath))}-manual-app.png`,
)
const port = 9537 + (process.pid % 300)
const profile = path.join(os.tmpdir(), `maa-script-manager-smoke-${process.pid}`)
await mkdir(profile, { recursive: true })
await mkdir(path.dirname(screenshotPath), { recursive: true })

const chrome = spawn(chromePath, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  '--window-size=1920,1200',
  pageUrl,
], { stdio: ['ignore', 'ignore', 'pipe'] })
let chromeError = ''
chrome.stderr.on('data', (chunk) => {
  chromeError = `${chromeError}${chunk}`.slice(-4000)
})

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function waitForTarget() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (chrome.exitCode !== null) throw new Error(`Chrome exited with ${chrome.exitCode}: ${chromeError}`)
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json`)
      const targets = await response.json()
      const target = targets.find((item) => item.type === 'page')
      if (target?.webSocketDebuggerUrl) return target
    } catch {}
    await delay(200)
  }
  throw new Error(`Chrome DevTools target did not start: ${chromeError}`)
}

let socket
try {
  const target = await waitForTarget()
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })

  let commandId = 0
  const pending = new Map()
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (!message.id) return
    const resolver = pending.get(message.id)
    if (!resolver) return
    pending.delete(message.id)
    if (message.error) resolver.reject(new Error(message.error.message))
    else resolver.resolve(message.result)
  })
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++commandId
    pending.set(id, { resolve, reject })
    socket.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
    return result.result.value
  }

  await send('Page.enable')
  await send('Runtime.enable')
  await delay(2200)

  const connected = await evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.includes('连接并锁定手机'));
    if (!button) return false;
    button.click();
    return true;
  })()`)
  if (!connected) throw new Error('Connect button was not found')

  for (let attempt = 0; attempt < 80; attempt += 1) {
    await delay(300)
    if (await evaluate(`document.body.innerText.includes('断开会话')`)) break
  }

  const loadOrder = await evaluate(`(() => {
    const selects = [...document.querySelectorAll('.script-library-row .el-select')];
    return {
      count: selects.length,
      categoryPlaceholder: selects[0]?.textContent?.trim() || '',
      scriptPlaceholder: selects[1]?.textContent?.trim() || '',
      scriptDisabled: selects[1]?.classList.contains('is-disabled') || selects[1]?.querySelector('input')?.disabled || false,
    };
  })()`)

  const managerOpened = await evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === '管理脚本库');
    if (!button) return false;
    button.click();
    return true;
  })()`)
  await delay(500)

  const managerState = await evaluate(`(() => {
    const manager = document.querySelector('.script-manager');
    const text = manager?.innerText || '';
    return {
      visible: Boolean(manager),
      title: document.body.innerText.includes('脚本库管理'),
      categories: text.includes('应用分类') && text.includes('未分类'),
      upload: text.includes('上传 JSON 脚本') && text.includes('选择 JSON 并上传'),
      operations: text.includes('操作记录'),
      actions: text.includes('脚本列表'),
    };
  })()`)

  const categorySelected = await evaluate(`(() => {
    const button = [...document.querySelectorAll('.category-sidebar button')].find((item) => item.textContent?.includes('com.RoamingStar.BlueArchive'));
    if (!button) return false;
    button.click();
    return true;
  })()`)
  await delay(350)

  const categoryState = await evaluate(`(() => {
    const manager = document.querySelector('.script-manager');
    const aliasInput = manager?.querySelector('.alias-editor input');
    const text = manager?.innerText || '';
    return {
      aliasInput: Boolean(aliasInput),
      aliasValue: aliasInput?.value || '',
      saveName: text.includes('保存名称'),
      packageVisible: text.includes('com.RoamingStar.BlueArchive'),
      scriptsVisible: text.includes('开始脚本') && text.includes('普通脚本'),
      actionsVisible: text.includes('载入编辑') && text.includes('下载 JSON') && text.includes('删除'),
    };
  })()`)

  const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'))

  const loadedStartScript = await evaluate(`(() => {
    const article = [...document.querySelectorAll('.script-list article')].find((item) => item.textContent?.includes('开始脚本'));
    const button = article ? [...article.querySelectorAll('button')].find((item) => item.textContent?.trim() === '载入编辑') : null;
    if (!button) return false;
    button.click();
    return true;
  })()`)
  await delay(500)

  const launchSelected = await evaluate(`(() => {
    const step = [...document.querySelectorAll('.flow-step')].find((item) => item.textContent?.includes('打开应用'));
    if (!step) return false;
    step.click();
    return true;
  })()`)
  await delay(250)

  const manualCorrection = await evaluate(`(() => {
    const details = document.querySelector('.advanced-app-config');
    if (!details) return { submitted: false, value: '' };
    details.open = true;
    const inputs = details.querySelectorAll('input');
    const packageInput = inputs[0];
    const activityInput = inputs[1];
    if (!packageInput || !activityInput) return { submitted: false, value: '' };
    packageInput.value = 'com.example.manual/com.example.ManualActivity';
    packageInput.dispatchEvent(new Event('input', { bubbles: true }));
    activityInput.value = '';
    activityInput.dispatchEvent(new Event('input', { bubbles: true }));
    packageInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
    return {
      submitted: true,
      saveButton: [...details.querySelectorAll('button')].some((item) => item.textContent?.includes('保存修正')),
    };
  })()`)
  await delay(350)

  const manualState = await evaluate(`(() => {
    const text = document.querySelector('.step-config')?.innerText || '';
    const code = document.querySelector('.app-detection-card code')?.textContent || '';
    return {
      packageSaved: code.includes('com.example.manual'),
      activitySaved: code.includes('com.example.ManualActivity'),
      hint: text.includes('已手动保存'),
    };
  })()`)

  const manualScreenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(manualScreenshotPath, Buffer.from(manualScreenshot.data, 'base64'))

  await evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === '断开会话');
    button?.click();
  })()`)
  await delay(200)
  await evaluate(`(() => {
    const button = document.querySelector('.el-message-box__btns .el-button--primary');
    button?.click();
  })()`)
  await delay(800)

  const result = {
    connected,
    loadOrder,
    managerOpened,
    managerState,
    categorySelected,
    categoryState,
    loadedStartScript,
    launchSelected,
    manualCorrection,
    manualState,
    screenshotPath,
    manualScreenshotPath,
  }
  console.log(JSON.stringify(result, null, 2))
  if (
    loadOrder.count !== 2
    || !loadOrder.categoryPlaceholder.includes('选择应用分类')
    || !loadOrder.scriptPlaceholder.includes('选择对应脚本')
    || !loadOrder.scriptDisabled
    || !managerOpened
    || Object.values(managerState).some((value) => value !== true)
    || !categorySelected
    || !categoryState.aliasInput
    || !categoryState.saveName
    || !categoryState.packageVisible
    || !categoryState.scriptsVisible
    || !loadedStartScript
    || !launchSelected
    || !manualCorrection.submitted
    || !manualCorrection.saveButton
    || !manualState.packageSaved
    || !manualState.activitySaved
    || !manualState.hint
  ) process.exitCode = 2
} finally {
  try { socket?.close() } catch {}
  if (chrome.exitCode === null && chrome.pid) {
    try {
      const killer = spawn('taskkill.exe', ['/PID', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' })
      await new Promise((resolve) => killer.once('close', resolve))
    } catch {
      try { chrome.kill() } catch {}
    }
  }
  await delay(400)
  const tempRoot = path.resolve(os.tmpdir()) + path.sep
  if (path.resolve(profile).startsWith(tempRoot)) {
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
  }
}
