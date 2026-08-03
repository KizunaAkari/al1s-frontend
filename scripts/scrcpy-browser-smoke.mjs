import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const chromePath = process.argv[2] || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const pageUrl = process.argv[3] || 'http://127.0.0.1:8000/editor/tronlong-rk3576-01'
const screenshotPath = path.resolve(process.argv[4] || 'artifacts/browser/scrcpy-browser-smoke.png')
const holdMilliseconds = Number.parseInt(process.argv[5] || '0', 10)
const testMode = process.argv[6] || 'default'
const importScreenshotPath = testMode === 'failure-import' && process.argv[7] ? path.resolve(process.argv[7]) : ''
const windowSizeArgument = testMode === 'failure-import' ? process.argv[8] : process.argv[7]
const windowSize = /^\d{3,4},\d{3,4}$/.test(windowSizeArgument || '') ? windowSizeArgument : '1920,1200'
const port = 9337 + (process.pid % 500)
const profile = path.join(os.tmpdir(), `maa-scrcpy-smoke-${process.pid}`)
await mkdir(profile, { recursive: true })
await mkdir(path.dirname(screenshotPath), { recursive: true })

const chrome = spawn(chromePath, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  `--window-size=${windowSize}`,
  '--autoplay-policy=no-user-gesture-required',
  pageUrl,
], { stdio: ['ignore', 'ignore', 'pipe'] })
let chromeError = ''
chrome.stderr.on('data', (chunk) => {
  chromeError = `${chromeError}${chunk}`.slice(-4000)
})

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function waitForTarget() {
  let lastError
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (chrome.exitCode !== null) {
      throw new Error(`Chrome exited with ${chrome.exitCode}: ${chromeError.trim()}`)
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json`)
      const targets = await response.json()
      const target = targets.find((item) => item.type === 'page')
      if (target?.webSocketDebuggerUrl) return target
    } catch (error) {
      lastError = error
    }
    await delay(200)
  }
  throw new Error(`Chrome DevTools target did not start: ${lastError?.message || 'unknown error'} ${chromeError.trim()}`)
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
  socket.addEventListener('close', () => {
    const error = new Error(`Chrome DevTools socket closed: ${chromeError.trim()}`)
    for (const resolver of pending.values()) resolver.reject(error)
    pending.clear()
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
  await send('DOM.enable')
  await delay(2500)
  const clicked = await evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.includes('连接并锁定手机'));
    if (!button) return false;
    button.click();
    return true;
  })()`)
  if (!clicked) throw new Error('Connect button was not found')

  let state
  for (let attempt = 0; attempt < 90; attempt += 1) {
    await delay(500)
    state = await evaluate(`(() => {
      const text = document.body.innerText;
      const fpsMatch = text.match(/SCRCPY ·\\s*(\\d+)\\s*FPS/);
      return {
        scrcpy: Boolean(fpsMatch),
        fps: Number(fpsMatch?.[1] || 0),
        fallback: text.includes('实时远控启动失败'),
        warning: [...document.querySelectorAll('.el-alert')].map((item) => item.textContent).join(' | '),
        canvases: [...document.querySelectorAll('canvas')].map((item) => ({
          width: item.width,
          height: item.height,
          visible: getComputedStyle(item).display !== 'none',
        })),
      };
    })()`)
    if (state.fps > 0 || state.fallback) break
  }

  let requestedOrientationApplied = true
  if (testMode === 'layout-portrait' || testMode === 'layout-landscape') {
    const requestedLabel = testMode === 'layout-landscape' ? '横屏' : '竖屏'
    requestedOrientationApplied = await evaluate(`(async () => {
      document.querySelector('.orientation-control .el-select')?.click();
      await new Promise((resolve) => setTimeout(resolve, 250));
      const option = [...document.querySelectorAll('.el-select-dropdown__item')].find((item) => item.textContent?.trim() === '${requestedLabel}');
      if (!option) return false;
      option.click();
      await new Promise((resolve) => setTimeout(resolve, 1400));
      return document.querySelector('.orientation-control .el-select')?.textContent?.includes('${requestedLabel}') || false;
    })()`)
  }

  let controlClicked = false
  if (state?.fps > 0) {
    controlClicked = await evaluate(`(() => {
      const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === '主页');
      if (!button) return false;
      button.click();
      return true;
    })()`)
    await delay(1200)
  }

  const themeToggleVisible = await evaluate(`Boolean(document.querySelector('.theme-toggle'))`)
  let lightThemeApplied = false
  let lightSurfacesVisible = false
  let lightGuideVisible = false
  let themePersisted = false
  let darkThemeRestored = true
  if (testMode === 'theme-switch') {
    await evaluate(`document.querySelector('.theme-toggle')?.click()`)
    await delay(350)
    const themeState = await evaluate(`(() => {
      const workspace = document.querySelector('.workspace');
      const phonePanel = document.querySelector('.phone-panel');
      return {
        applied: document.documentElement.dataset.theme === 'light',
        persisted: localStorage.getItem('maa-console-theme') === 'light',
        workspace: workspace ? getComputedStyle(workspace).backgroundColor : '',
        phonePanel: phonePanel ? getComputedStyle(phonePanel).backgroundColor : '',
      };
    })()`)
    lightThemeApplied = themeState.applied
    themePersisted = themeState.persisted
    lightSurfacesVisible = themeState.workspace === 'rgb(255, 255, 255)' && themeState.phonePanel === 'rgb(255, 255, 255)'
    await evaluate(`([...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === '使用说明'))?.click()`)
    await delay(350)
    lightGuideVisible = await evaluate(`(() => {
      const guide = document.querySelector('.guide-shell');
      return Boolean(guide) && getComputedStyle(guide).backgroundColor === 'rgb(246, 248, 251)' && getComputedStyle(guide).color === 'rgb(23, 36, 51)';
    })()`)
    await evaluate(`document.querySelector('.guide-header button')?.click()`)
    await delay(250)
  }

  let failureTabVisible = false
  let failureRecordVisible = false
  let importControlVisible = false
  let importApplied = false
  let notificationTabVisible = false
  let notificationFormVisible = false
  let passwordNotExposed = false
  let notificationScreenCaptured = false
  let chineseScriptNameAccepted = false
  let jsonSuffixHidden = false
  let mappedStorageNameCreated = false
  if (testMode === 'failure-import') {
    failureTabVisible = await evaluate(`[...document.querySelectorAll('.el-tabs__item')].some((item) => item.textContent?.trim() === '失败记录')`)
    await evaluate(`([...document.querySelectorAll('.el-tabs__item')].find((item) => item.textContent?.trim() === '失败记录'))?.click()`)
    await delay(500)
    failureRecordVisible = await evaluate(`document.body.innerText.includes('failure-evidence-smoke.json') && document.body.innerText.includes('failure_probe_for_evidence')`)
    await evaluate(`([...document.querySelectorAll('.el-tabs__item')].find((item) => item.textContent?.trim() === '脚本编辑器'))?.click()`)
    await delay(500)
    importControlVisible = await evaluate(`document.body.innerText.includes('导入截图')`)
    if (importScreenshotPath) {
      const document = await send('DOM.getDocument', { depth: -1, pierce: true })
      const input = await send('DOM.querySelector', { nodeId: document.root.nodeId, selector: '.screen-import-input' })
      if (input.nodeId) {
        await send('DOM.setFileInputFiles', { nodeId: input.nodeId, files: [importScreenshotPath] })
        for (let attempt = 0; attempt < 20; attempt += 1) {
          await delay(250)
          importApplied = await evaluate(`document.body.innerText.includes('已导入 ·') && document.body.innerText.includes('failure-evidence-smoke.png') && document.body.innerText.includes('离线截图：')`)
          if (importApplied) break
        }
      }
    }
  }
  if (testMode === 'notification-settings') {
    notificationTabVisible = await evaluate(`[...document.querySelectorAll('.el-tabs__item')].some((item) => item.textContent?.trim() === '通知设置')`)
    await evaluate(`([...document.querySelectorAll('.el-tabs__item')].find((item) => item.textContent?.trim() === '通知设置'))?.click()`)
    await delay(500)
    notificationFormVisible = await evaluate(`document.body.innerText.includes('邮件发送器') && document.body.innerText.includes('SMTP 服务器') && document.body.innerText.includes('发送测试邮件') && document.body.innerText.includes('应用专用密码')`)
    passwordNotExposed = await evaluate(`(() => { const input = document.querySelector('input[autocomplete="new-password"]'); return Boolean(input) && !input.value; })()`)
    const notificationScreenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    await writeFile(screenshotPath, Buffer.from(notificationScreenshot.data, 'base64'))
    notificationScreenCaptured = true
    await evaluate(`([...document.querySelectorAll('.el-tabs__item')].find((item) => item.textContent?.trim() === '脚本编辑器'))?.click()`)
    await delay(500)
  }
  if (testMode === 'script-name-mapping') {
    chineseScriptNameAccepted = await evaluate(`(() => {
      const input = document.querySelector('input[placeholder="脚本名称（支持中文）"]');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, '中文流程映射测试');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return input.value === '中文流程映射测试';
    })()`)
    await evaluate(`([...document.querySelectorAll('.script-document-actions button')].find((item) => item.textContent?.trim() === '保存脚本'))?.click()`)
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await delay(250)
      mappedStorageNameCreated = await evaluate(`fetch('/api/agents/tronlong-rk3576-01/scripts').then((response) => response.json()).then((items) => items.some((item) => item.name === '中文流程映射测试.json'))`)
      if (mappedStorageNameCreated) break
    }
    jsonSuffixHidden = await evaluate(`(() => {
      const editorInput = document.querySelector('input[placeholder="脚本名称（支持中文）"]');
      const libraryText = document.querySelector('.script-library-row')?.innerText || '';
      return editorInput?.value === '中文流程映射测试' && libraryText.includes('中文流程映射测试') && !editorInput.value.endsWith('.json') && !libraryText.includes('中文流程映射测试.json');
    })()`)
  }

  const globalRuleClicked = await evaluate(`(() => {
    const button = document.querySelector('button[title="添加只在指定步骤检测的弹窗规则"]');
    if (!button) return false;
    button.click();
    return true;
  })()`)
  if (globalRuleClicked) await delay(500)
  const globalRuleConfigVisible = await evaluate(`document.body.innerText.includes('指定步骤弹窗守卫')`)
  const orientationControlVisible = await evaluate(`Boolean(document.querySelector('.orientation-control .el-select')) && document.querySelector('.orientation-control')?.textContent?.includes('方向')`)
  const singleStepControlVisible = await evaluate(`Boolean(document.querySelector('button[title^="单步试运行"]'))`)
  const globalSingleRunVisible = await evaluate(`Boolean(document.querySelector('button[title^="单独试运行此弹窗规则"]'))`)
  const globalSeparateClickImageVisible = await evaluate(`document.body.innerText.includes('尚未单独截取关闭按钮图片')`)
  let singleStepStarted = false
  let liveDuringSingleStep = false
  let liveAfterSingleStep = false
  let singleStepElapsedMs = 0
  if (testMode === 'single-step-live') {
    const startedAt = Date.now()
    singleStepStarted = await evaluate(`(() => {
      const button = document.querySelector('.flow-step button[title^="单步试运行"]');
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })()`)
    for (let attempt = 0; attempt < 80 && singleStepStarted; attempt += 1) {
      await delay(100)
      const singleStepState = await evaluate(`(() => {
        const button = document.querySelector('.flow-step button[title^="单步试运行"]');
        const text = document.body.innerText;
        return {
          running: button?.textContent?.trim() === '…',
          live: text.includes('SCRCPY ·') && !text.includes('scrcpy 视频流已结束'),
          overlay: text.includes('正在执行脚本，实时画面继续更新'),
        };
      })()`)
      if (singleStepState.running && singleStepState.live && singleStepState.overlay) liveDuringSingleStep = true
      if (!singleStepState.running && liveDuringSingleStep) break
    }
    singleStepElapsedMs = Date.now() - startedAt
    liveAfterSingleStep = await evaluate(`document.body.innerText.includes('SCRCPY ·') && !document.body.innerText.includes('scrcpy 视频流已结束')`)
  }
  await evaluate(`([...document.querySelectorAll('.mode-tabs button')].find((item) => item.textContent?.trim() === '脚本标注'))?.click()`)
  await delay(250)
  const manualRefreshControlVisible = await evaluate(`[...document.querySelectorAll('button')].some((item) => item.textContent?.trim() === '刷新无损截图')`)
  await evaluate(`([...document.querySelectorAll('.mode-tabs button')].find((item) => item.textContent?.trim() === '远程控制'))?.click()`)
  const layoutState = await evaluate(`(() => {
    const workspace = document.querySelector('.visual-workspace');
    const phone = document.querySelector('.phone-panel');
    const flow = document.querySelector('.flow-panel');
    const flowBody = document.querySelector('.flow-body');
    const modeBar = document.querySelector('.phone-mode-bar');
    const actions = document.querySelector('.script-document-actions');
    const rect = (element) => element ? element.getBoundingClientRect() : null;
    return {
      workspaceWidth: Math.round(rect(workspace)?.width || 0),
      phoneWidth: Math.round(rect(phone)?.width || 0),
      flowWidth: Math.round(rect(flow)?.width || 0),
      flowColumns: getComputedStyle(flowBody).gridTemplateColumns,
      flowBodyFits: Boolean(flowBody) && flowBody.scrollWidth <= flowBody.clientWidth + 1,
      phoneToolbarFits: Boolean(modeBar) && modeBar.scrollWidth <= modeBar.clientWidth + 1,
      scriptActionsFit: Boolean(actions) && actions.scrollWidth <= actions.clientWidth + 1,
      workspaceFits: Boolean(workspace) && workspace.scrollWidth <= workspace.clientWidth + 1,
      landscapeClass: workspace?.classList.contains('landscape-layout') || false,
    };
  })()`)

  let appWaitingVisible = false
  let appDetected = false
  let lifecycleControlsVisible = false
  let separateClickImageVisible = false
  if (testMode === 'app-detection') {
    if (globalRuleClicked) {
      await evaluate(`document.querySelector('button[title="删除此步骤弹窗规则"]')?.click()`)
      await delay(300)
    }
    const pickerOpened = await evaluate(`(() => {
      const button = document.querySelector('.flow-insert button');
      if (!button) return false;
      button.click();
      return true;
    })()`)
    if (pickerOpened) await delay(300)
    const appEventAdded = await evaluate(`(() => {
      const button = [...document.querySelectorAll('.event-picker button')].find((item) => item.textContent?.includes('打开应用'));
      if (!button) return false;
      button.click();
      return true;
    })()`)
    if (appEventAdded) {
      for (let attempt = 0; attempt < 30; attempt += 1) {
        await delay(400)
        appWaitingVisible = await evaluate(`document.body.innerText.includes('等待打开目标应用')`)
        if (appWaitingVisible) break
      }
      for (let attempt = 0; attempt < 75; attempt += 1) {
        await delay(400)
        appDetected = await evaluate(`document.body.innerText.includes('已捕获当前应用') && document.body.innerText.includes('com.android.settings')`)
        if (appDetected) break
      }
      lifecycleControlsVisible = await evaluate(`document.body.innerText.includes('冷启动应用') && document.body.innerText.includes('结束：强制停止应用并返回主页')`)
    }
  }

  if (!notificationScreenCaptured) {
    const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    await writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'))
  }
  if (holdMilliseconds > 0) await delay(holdMilliseconds)
  if (testMode === 'theme-switch') {
    await evaluate(`document.querySelector('.theme-toggle')?.click()`)
    await delay(250)
    darkThemeRestored = await evaluate(`document.documentElement.dataset.theme === 'dark' && localStorage.getItem('maa-console-theme') === 'dark'`)
  }
  if (testMode === 'app-detection') {
    await evaluate(`document.querySelector('.flow-step.selected button[title="删除"]')?.click()`)
    await delay(300)
    await evaluate(`document.querySelector('button[title="添加流水线事件"]')?.click()`)
    await delay(300)
    await evaluate(`([...document.querySelectorAll('.event-picker button')].find((item) => item.textContent?.includes('点击事件')))?.click()`)
    await delay(300)
    separateClickImageVisible = await evaluate(`document.body.innerText.includes('尚未单独截取点击图片')`)
    await evaluate(`document.querySelector('.flow-step.selected button[title="删除"]')?.click()`)
    await delay(300)
  } else if (globalRuleClicked) {
    await evaluate(`document.querySelector('button[title="删除此步骤弹窗规则"]')?.click()`)
    await delay(300)
  }
  const disconnected = await evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === '断开会话');
    if (!button) return false;
    button.click();
    return true;
  })()`)
  if (disconnected) await delay(2500)
  console.log(JSON.stringify({ clicked, controlClicked, requestedOrientationApplied, themeToggleVisible, lightThemeApplied, lightSurfacesVisible, lightGuideVisible, themePersisted, darkThemeRestored, globalRuleClicked, globalRuleConfigVisible, orientationControlVisible, singleStepControlVisible, globalSingleRunVisible, globalSeparateClickImageVisible, singleStepStarted, liveDuringSingleStep, liveAfterSingleStep, singleStepElapsedMs, manualRefreshControlVisible, layoutState, appWaitingVisible, appDetected, lifecycleControlsVisible, separateClickImageVisible, failureTabVisible, failureRecordVisible, importControlVisible, importApplied, notificationTabVisible, notificationFormVisible, passwordNotExposed, chineseScriptNameAccepted, jsonSuffixHidden, mappedStorageNameCreated, disconnected, screenshotPath, holdMilliseconds, testMode, ...state }, null, 2))
  if (!state?.scrcpy || state.fps <= 0 || !requestedOrientationApplied || !themeToggleVisible || !globalRuleConfigVisible || !orientationControlVisible || !singleStepControlVisible || !globalSingleRunVisible || !globalSeparateClickImageVisible || !manualRefreshControlVisible || !layoutState.flowBodyFits || !layoutState.phoneToolbarFits || !layoutState.scriptActionsFit || !layoutState.workspaceFits || (testMode === 'theme-switch' && (!lightThemeApplied || !lightSurfacesVisible || !lightGuideVisible || !themePersisted || !darkThemeRestored)) || (testMode === 'layout-landscape' && !layoutState.landscapeClass) || (testMode === 'layout-portrait' && layoutState.landscapeClass) || (testMode === 'single-step-live' && (!singleStepStarted || !liveDuringSingleStep || !liveAfterSingleStep)) || (testMode === 'app-detection' && (!appWaitingVisible || !appDetected || !lifecycleControlsVisible || !separateClickImageVisible)) || (testMode === 'failure-import' && (!failureTabVisible || !failureRecordVisible || !importControlVisible || !importApplied)) || (testMode === 'notification-settings' && (!notificationTabVisible || !notificationFormVisible || !passwordNotExposed)) || (testMode === 'script-name-mapping' && (!chineseScriptNameAccepted || !jsonSuffixHidden || !mappedStorageNameCreated))) process.exitCode = 2
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
  await delay(500)
  const tempRoot = path.resolve(os.tmpdir()) + path.sep
  if (path.resolve(profile).startsWith(tempRoot)) {
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
  }
}
