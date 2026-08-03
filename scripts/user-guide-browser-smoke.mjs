import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const chromePath = process.argv[2] || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const pageUrl = process.argv[3] || 'http://127.0.0.1:8000'
const screenshotPath = path.resolve(process.argv[4] || 'artifacts/browser/user-guide-browser-smoke.png')
const viewportWidth = Number(process.argv[5] || 1920)
const viewportHeight = Number(process.argv[6] || 1200)
const editorScreenshotPath = path.join(
  path.dirname(screenshotPath),
  `${path.basename(screenshotPath, path.extname(screenshotPath))}-editor.png`,
)
const taskScreenshotPath = path.join(
  path.dirname(screenshotPath),
  `${path.basename(screenshotPath, path.extname(screenshotPath))}-task.png`,
)
const port = 9437 + (process.pid % 400)
const profile = path.join(os.tmpdir(), `maa-user-guide-smoke-${process.pid}`)
await mkdir(profile, { recursive: true })
await mkdir(path.dirname(screenshotPath), { recursive: true })

const chrome = spawn(chromePath, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  `--window-size=${viewportWidth},${viewportHeight}`,
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
    if (chrome.exitCode !== null) throw new Error(`Chrome exited with ${chrome.exitCode}: ${chromeError.trim()}`)
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
  throw new Error(`Chrome DevTools target did not start: ${lastError?.message || 'unknown error'}`)
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
  await delay(2500)

  const consoleActionsAccurate = await evaluate(`(() => {
    const topbar = document.querySelector('.top-actions')?.innerText || '';
    const terminal = document.querySelector('.terminal-control-groups')?.innerText || '';
    return topbar.includes('状态每 5 秒自动刷新') && !topbar.includes('刷新状态') && !document.body.innerText.includes('DEMO')
      && terminal.includes('任务接收') && terminal.includes('手机与诊断')
      && (terminal.includes('暂停接收任务') || terminal.includes('恢复接收任务'))
      && terminal.includes('抓取画面') && terminal.includes('Agent 日志');
  })()`)

  const helpButtonFound = await evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === '使用说明');
    if (!button) return false;
    button.click();
    return true;
  })()`)
  await delay(700)

  const guideState = await evaluate(`(() => {
    const text = document.querySelector('.guide-shell')?.innerText || '';
    return {
      visible: Boolean(document.querySelector('.guide-shell')),
      title: text.includes('MAA Test Console 使用说明'),
      quickStart: text.includes('第一次运行脚本'),
      events: text.includes('流水线事件速查') && text.includes('点击事件') && text.includes('打开应用'),
      failures: text.includes('失败记录与邮件告警'),
      scheduling: text.includes('任务排队、重试和录屏') && text.includes('低于 5 GiB'),
      boundaries: text.includes('当前版本的使用边界'),
      sections: document.querySelectorAll('.guide-section').length,
    };
  })()`)

  const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'))

  const editorShortcutFound = await evaluate(`(() => {
    const button = [...document.querySelectorAll('.guide-actions button')].find((item) => item.textContent?.trim() === '打开脚本编辑器');
    if (!button) return false;
    button.click();
    return true;
  })()`)
  await delay(700)
  const editorNavigationWorks = await evaluate(`(() => {
    const activeTab = document.querySelector('.el-tabs__item.is-active');
    const guide = document.querySelector('.guide-shell');
    return activeTab?.textContent?.trim() === '脚本编辑器' && (!guide || guide.offsetParent === null);
  })()`)
  const editorQuickTestButtonVisible = await evaluate(`(() => {
    const button = document.querySelector('.quick-test-button');
    return Boolean(button) && button.textContent?.includes('临时测试')
      && button.getAttribute('title')?.includes('不计任务统计');
  })()`)
  const editorActionsAccurate = await evaluate(`(() => {
    const actions = document.querySelector('.script-document-actions')?.innerText || '';
    const library = document.querySelector('.script-library-row')?.innerText || '';
    const header = document.querySelector('.flow-header')?.innerText || '';
    return actions.includes('保存脚本') && actions.includes('保存并试运行') && actions.includes('临时测试')
      && library.includes('脚本库') && library.includes('管理脚本库')
      && header.includes('步骤弹窗') && !actions.includes('＋ 弹窗') && !actions.includes('＋ 事件');
  })()`)
  const editorTypeSelectorOpened = await evaluate(`(() => {
    const select = document.querySelector('.module-script-settings .el-select');
    if (!select) return false;
    select.click();
    return true;
  })()`)
  await delay(300)
  const editorModuleControlsVisible = await evaluate(`(() => {
    const settings = document.querySelector('.module-script-settings')?.textContent || '';
    const options = [...document.querySelectorAll('.el-select-dropdown__item')]
      .map((item) => item.textContent || '').join(' ');
    return settings.includes('脚本类型') && options.includes('普通脚本')
      && options.includes('开始脚本') && options.includes('过程脚本');
  })()`)

  const feedbackEventInserted = await evaluate(`(() => {
    const add = document.querySelector('.flow-insert button');
    if (!add) return false;
    add.click();
    return true;
  })()`)
  await delay(300)
  const feedbackEventSelected = await evaluate(`(() => {
    const event = [...document.querySelectorAll('.event-picker button')]
      .find((item) => item.textContent?.includes('反馈事件'));
    if (!event) return false;
    event.click();
    return true;
  })()`)
  await delay(300)
  const conditionToggleFound = await evaluate(`(() => {
    const card = document.querySelector('.conditional-skip-card');
    const checkbox = card?.querySelector('.el-checkbox');
    if (!card || !checkbox || !card.textContent?.includes('开启条件跳过')) return false;
    checkbox.click();
    return true;
  })()`)
  await delay(300)
  const conditionalFeedbackControlsVisible = await evaluate(`(() => {
    const text = document.querySelector('.step-config')?.textContent || '';
    return text.includes('判断类型') && text.includes('OCR 数值') && text.includes('图片匹配')
      && text.includes('数字识别区域') && text.includes('OCR 数字')
      && text.includes('则跳过') && text.includes('截图并发送成功反馈')
      && text.includes('通知设置') && text.includes('测试当前画面的 OCR 条件')
      && text.includes('第一个数字');
  })()`)
  const imageSkipModeSelected = await evaluate(`(() => {
    const option = [...document.querySelectorAll('.condition-type-row .el-radio-button')]
      .find((item) => item.textContent?.trim() === '图片匹配');
    if (!option) return false;
    option.click();
    return true;
  })()`)
  await delay(300)
  const imageSkipControlsVisible = await evaluate(`(() => {
    const text = document.querySelector('.conditional-skip-card')?.textContent || '';
    return text.includes('匹配图片模板') && text.includes('图片相似度')
      && text.includes('达到则跳过') && text.includes('测试当前画面的图片匹配条件')
      && text.includes('MaaFramework 模板图片');
  })()`)
  const postAssertionToggleFound = await evaluate(`(() => {
    const card = document.querySelector('.post-assertion-card');
    const checkbox = card?.querySelector('.el-checkbox');
    if (!card || !checkbox || !card.textContent?.includes('执行后断言')) return false;
    checkbox.click();
    return true;
  })()`)
  await delay(300)
  const postAssertionControlsVisible = await evaluate(`(() => {
    const text = document.querySelector('.post-assertion-card')?.textContent || '';
    return text.includes('断言图片') && text.includes('单次等待秒数')
      && text.includes('失败后重试次数') && text.includes('重新执行');
  })()`)
  const clickEventPickerOpened = await evaluate(`(() => {
    const buttons = [...document.querySelectorAll('.flow-insert button')];
    const add = buttons.at(-1);
    if (!add) return false;
    add.click();
    return true;
  })()`)
  await delay(300)
  const clickEventSelected = await evaluate(`(() => {
    const event = [...document.querySelectorAll('.event-picker button')]
      .find((item) => item.textContent?.includes('点击事件'));
    if (!event) return false;
    event.click();
    return true;
  })()`)
  await delay(300)
  const failureRetryToggleFound = await evaluate(`(() => {
    const card = document.querySelector('.failure-retry-card');
    const checkbox = card?.querySelector('.el-checkbox');
    if (!card || !checkbox || !card.textContent?.includes('失败重试过程脚本')) return false;
    checkbox.click();
    return true;
  })()`)
  await delay(300)
  const failureRetryControlsVisible = await evaluate(`(() => {
    const text = document.querySelector('.failure-retry-card')?.textContent || '';
    return text.includes('#03 失败') && text.includes('运行过程脚本')
      && text.includes('重试 #03') && text.includes('恢复过程脚本')
      && text.includes('最大重试次数') && text.includes('过程脚本自身失败');
  })()`)
  const matchOffsetModeSelected = await evaluate(`(() => {
    const option = [...document.querySelectorAll('.click-position-modes .el-radio-button')]
      .find((item) => item.textContent?.trim() === '关联识别图');
    if (!option) return false;
    option.click();
    return true;
  })()`)
  await delay(300)
  const matchOffsetControlsVisible = await evaluate(`(() => {
    const text = document.querySelector('.match-offset-card')?.textContent || '';
    return text.includes('循环清除重复目标') && text.includes('匹配结果排序')
      && text.includes('优先选择第几个') && text.includes('点击锚点')
      && text.includes('X 偏移') && text.includes('Y 偏移')
      && text.includes('最大点击次数') && text.includes('直到页面中不存在');
  })()`)
  const scopedPopupAdded = await evaluate(`(() => {
    const add = document.querySelector('.guard-head > button');
    if (!add) return false;
    add.click();
    return true;
  })()`)
  await delay(300)
  const scopedPopupSelectorOpened = await evaluate(`(() => {
    const selector = document.querySelector('.popup-step-selector .el-select__wrapper');
    if (!selector) return false;
    selector.click();
    return true;
  })()`)
  await delay(300)
  const scopedPopupControlsVisible = await evaluate(`(() => {
    const selector = document.querySelector('.popup-step-selector');
    const config = document.querySelector('.step-config')?.textContent || '';
    const stepTags = [...document.querySelectorAll('.step-index')]
      .map((item) => item.textContent?.trim());
    const options = [...document.querySelectorAll('.el-select-dropdown__item')]
      .filter((item) => item.offsetParent !== null)
      .map((item) => item.textContent || '')
      .join(' ');
    return Boolean(selector) && stepTags.includes('#01') && stepTags.includes('#02')
      && config.includes('#01') && options.includes('#01') && options.includes('#02');
  })()`)
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' })
  await evaluate(`(() => {
    const target = [...document.querySelectorAll('.flow-step')].at(-1);
    if (!target) return false;
    target.click();
    return true;
  })()`)
  await delay(300)
  await evaluate(`window.scrollTo(0, 0)`)
  await delay(200)
  const editorSetupLayout = await evaluate(`(() => {
    const topbar = document.querySelector('.editor-topbar');
    const session = document.querySelector('.session-bar');
    const phoneWork = document.querySelector('.phone-work-area');
    const flowBody = document.querySelector('.flow-body');
    if (!topbar || !session || !phoneWork || !flowBody) return { valid: false };
    return {
      valid: document.documentElement.scrollHeight > window.innerHeight
        && getComputedStyle(topbar).position !== 'sticky'
        && getComputedStyle(phoneWork).position === 'sticky'
        && getComputedStyle(flowBody).position === 'sticky',
      pageHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
      setupBottom: Math.round(session.getBoundingClientRect().bottom),
    };
  })()`)
  await evaluate(`window.scrollTo(0, document.documentElement.scrollHeight)`)
  await delay(300)
  const editorPinnedLayout = await evaluate(`(() => {
    const phoneWork = document.querySelector('.phone-work-area');
    const flowBody = document.querySelector('.flow-body');
    const phonePanel = document.querySelector('.phone-panel');
    const flowPanel = document.querySelector('.flow-panel');
    const workspace = document.querySelector('.visual-workspace');
    const sidebar = document.querySelector('.app-sidebar');
    const steps = document.querySelector('.step-list');
    const config = document.querySelector('.step-config');
    if (!phoneWork || !flowBody || !phonePanel || !flowPanel || !workspace || !sidebar || !steps || !config) return { valid: false };
    const phoneRect = phoneWork.getBoundingClientRect();
    const flowRect = flowBody.getBoundingClientRect();
    const phonePanelRect = phonePanel.getBoundingClientRect();
    const flowPanelRect = flowPanel.getBoundingClientRect();
    const sidebarRect = sidebar.getBoundingClientRect();
    return {
      valid: window.scrollY > 0
        && Math.abs(phoneRect.top - 10) <= 1 && Math.abs(flowRect.top - 10) <= 1
        && phoneRect.bottom <= window.innerHeight - 9 && flowRect.bottom <= window.innerHeight - 9
        && phoneRect.height >= window.innerHeight - 22 && flowRect.height >= window.innerHeight - 22
        && Math.abs(sidebarRect.top) <= 1 && Math.abs(sidebarRect.bottom - window.innerHeight) <= 1
        && ['auto', 'scroll'].includes(getComputedStyle(steps).overflowY)
        && ['auto', 'scroll'].includes(getComputedStyle(config).overflowY),
      pageScrollY: window.scrollY,
      viewportHeight: window.innerHeight,
      phone: { top: Math.round(phoneRect.top), bottom: Math.round(phoneRect.bottom), height: Math.round(phoneRect.height) },
      flow: { top: Math.round(flowRect.top), bottom: Math.round(flowRect.bottom), height: Math.round(flowRect.height) },
      panels: {
        phone: { top: Math.round(phonePanelRect.top), bottom: Math.round(phonePanelRect.bottom), height: Math.round(phonePanelRect.height) },
        flow: { top: Math.round(flowPanelRect.top), bottom: Math.round(flowPanelRect.bottom), height: Math.round(flowPanelRect.height) },
        alignItems: getComputedStyle(workspace).alignItems,
        phoneHeight: getComputedStyle(phonePanel).height,
        flowHeight: getComputedStyle(flowPanel).height,
      },
      sidebar: { top: Math.round(sidebarRect.top), bottom: Math.round(sidebarRect.bottom), position: getComputedStyle(sidebar).position },
      stepsOverflow: getComputedStyle(steps).overflowY,
      configOverflow: getComputedStyle(config).overflowY,
    };
  })()`)
  const editorPhoneFit = await evaluate(`(() => {
    const stage = document.querySelector('.phone-stage');
    const source = stage?.querySelector('.screen-canvas');
    if (!stage || !source) return { valid: false };
    const probe = source.cloneNode(false);
    probe.className = 'screen-canvas phone-fit-probe';
    probe.width = 488;
    probe.height = 1080;
    probe.style.cssText = 'display:block!important';
    stage.appendChild(probe);
    const stageRect = stage.getBoundingClientRect();
    const probeRect = probe.getBoundingClientRect();
    const renderedRatio = (probeRect.width - 2) / Math.max(1, probeRect.height - 2);
    const sourceRatio = 488 / 1080;
    const result = {
      valid: probeRect.width > 0 && probeRect.height > 0
        && probeRect.left >= stageRect.left - 1 && probeRect.right <= stageRect.right + 1
        && probeRect.top >= stageRect.top - 1 && probeRect.bottom <= stageRect.bottom + 1
        && Math.abs(renderedRatio - sourceRatio) < 0.02,
      stage: { width: Math.round(stageRect.width), height: Math.round(stageRect.height) },
      canvas: { width: Math.round(probeRect.width), height: Math.round(probeRect.height) },
      source: { width: 488, height: 1080 },
    };
    probe.remove();
    return result;
  })()`)
  const editorScreenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(editorScreenshotPath, Buffer.from(editorScreenshot.data, 'base64'))
  await delay(200)
  await evaluate(`window.scrollTo(0, 0)`)
  await delay(200)

  const taskTabFound = await evaluate(`(() => {
    const tab = [...document.querySelectorAll('.el-tabs__item')].find((item) => item.textContent?.trim() === '测试任务');
    if (!tab) return false;
    tab.click();
    return true;
  })()`)
  await delay(500)
  const taskDialogOpened = await evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === '下发测试任务');
    if (!button || button.disabled) return false;
    button.click();
    return true;
  })()`)
  await delay(700)
  const taskControlsVisible = await evaluate(`(() => {
    const text = document.querySelector('.task-create-form')?.textContent || '';
    return text.includes('目标终端') && text.includes('执行普通脚本') && text.includes('执行方式')
      && text.includes('单次任务') && text.includes('循环任务') && text.includes('定时任务')
      && text.includes('失败重试次数') && text.includes('任务录屏')
      && !text.includes('任务参数') && !text.includes('内置连通性 Demo');
  })()`)

  const compositionKindSelected = await evaluate(`(() => {
    const option = [...document.querySelectorAll('.dispatch-kind-card label')]
      .find((item) => item.textContent?.includes('脚本组合任务'));
    if (!option) return false;
    option.click();
    return true;
  })()`)
  await delay(400)
  const compositionControlsVisible = await evaluate(`(() => {
    const text = document.querySelector('.task-create-form')?.textContent || '';
    return text.includes('模块执行队列') && text.includes('开始脚本')
      && text.includes('添加过程脚本') && text.includes('组合失败重试次数')
      && text.includes('开始脚本每轮固定执行');
  })()`)
  const compositionIntervalLayout = await evaluate(`(() => {
    const number = document.querySelector('.composition-interval .el-input-number');
    const input = number?.querySelector('input');
    if (!number || !input) return { found: false };
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, '10');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.blur();
    return new Promise((resolve) => requestAnimationFrame(() => {
      const width = number.getBoundingClientRect().width;
      resolve({
        found: true,
        value: input.value,
        width,
        controlsRight: number.classList.contains('is-controls-right'),
      });
    }));
  })()`)
  const taskScreenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(taskScreenshotPath, Buffer.from(taskScreenshot.data, 'base64'))

  await evaluate(`(() => {
    const dialog = document.querySelector('.task-create-form')?.closest('.el-dialog');
    const button = dialog ? [...dialog.querySelectorAll('.el-dialog__footer button')].find((item) => item.textContent?.trim() === '取消') : null;
    button?.click();
  })()`)
  await delay(650)
  const maintenanceOpened = await evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === '存储与清理');
    if (!button) return false;
    button.click();
    return true;
  })()`)
  await delay(700)
  const maintenanceControlsVisible = await evaluate(`(() => {
    const text = document.querySelector('.maintenance-panel')?.textContent || '';
    return text.includes('任务历史') && text.includes('任务录屏') && text.includes('失败截图')
      && text.includes('清理内容') && text.includes('保留最近天数');
  })()`)

  const result = {
    consoleActionsAccurate,
    helpButtonFound,
    ...guideState,
    editorShortcutFound,
    editorNavigationWorks,
    editorQuickTestButtonVisible,
    editorActionsAccurate,
    editorTypeSelectorOpened,
    editorModuleControlsVisible,
    feedbackEventInserted,
    feedbackEventSelected,
    conditionToggleFound,
    conditionalFeedbackControlsVisible,
    imageSkipModeSelected,
    imageSkipControlsVisible,
    postAssertionToggleFound,
    postAssertionControlsVisible,
    clickEventPickerOpened,
    clickEventSelected,
    failureRetryToggleFound,
    failureRetryControlsVisible,
    matchOffsetModeSelected,
    matchOffsetControlsVisible,
    scopedPopupAdded,
    scopedPopupSelectorOpened,
    scopedPopupControlsVisible,
    editorSetupLayout,
    editorPinnedLayout,
    editorPhoneFit,
    taskTabFound,
    taskDialogOpened,
    taskControlsVisible,
    compositionKindSelected,
    compositionControlsVisible,
    compositionIntervalLayout,
    maintenanceOpened,
    maintenanceControlsVisible,
    screenshotPath,
    editorScreenshotPath,
    taskScreenshotPath,
  }
  console.log(JSON.stringify(result, null, 2))
  if (!consoleActionsAccurate || !helpButtonFound || !guideState.visible || !guideState.title || !guideState.quickStart || !guideState.events || !guideState.failures || !guideState.scheduling || !guideState.boundaries || guideState.sections < 8 || !editorShortcutFound || !editorNavigationWorks || !editorQuickTestButtonVisible || !editorActionsAccurate || !editorTypeSelectorOpened || !editorModuleControlsVisible || !feedbackEventInserted || !feedbackEventSelected || !conditionToggleFound || !conditionalFeedbackControlsVisible || !imageSkipModeSelected || !imageSkipControlsVisible || !postAssertionToggleFound || !postAssertionControlsVisible || !clickEventPickerOpened || !clickEventSelected || !failureRetryToggleFound || !failureRetryControlsVisible || !matchOffsetModeSelected || !matchOffsetControlsVisible || !scopedPopupAdded || !scopedPopupSelectorOpened || !scopedPopupControlsVisible || !editorSetupLayout.valid || !editorPinnedLayout.valid || !editorPhoneFit.valid || !taskTabFound || !taskDialogOpened || !taskControlsVisible || !compositionKindSelected || !compositionControlsVisible || !compositionIntervalLayout.found || compositionIntervalLayout.value !== '10' || compositionIntervalLayout.width < 116 || !compositionIntervalLayout.controlsRight || !maintenanceOpened || !maintenanceControlsVisible) process.exitCode = 2
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
  if (path.resolve(profile).startsWith(tempRoot)) await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
}
