<script setup lang="ts">
const visible = defineModel<boolean>({ default: false })
const emit = defineEmits<{ navigate: [tab: string] }>()

const sections = [
  { id: 'guide-quick-start', label: '快速开始' },
  { id: 'guide-pages', label: '页面与数据' },
  { id: 'guide-editor', label: '脚本编辑器' },
  { id: 'guide-events', label: '事件速查' },
  { id: 'guide-tasks', label: '任务与重试' },
  { id: 'guide-failures', label: '失败与通知' },
  { id: 'guide-terminal', label: '终端部署' },
  { id: 'guide-troubleshooting', label: '排查与边界' },
]

const events = [
  { name: '开始', use: '固定第一步', detail: '检查 ADB、唤醒屏幕、尝试解除无密码锁屏并返回 Android 主界面；失败会终止脚本。' },
  { name: '等待事件', use: '固定等待', detail: '暂停指定秒数，适合页面切换、动画或网络加载。' },
  { name: '等待画面', use: '只判断不点击', detail: '轮询等待目标图片出现，可配置匹配阈值、超时和轮询间隔。' },
  { name: '点击事件', use: '识别后点击', detail: '可使用独立条件图、单独点击图片、固定坐标，支持单击、双击、三连击和连续点击。' },
  { name: '滑动事件', use: '条件滑动', detail: '可持续滑动直到目标出现，或等待目标出现后持续滑动指定时间。' },
  { name: '返回事件', use: '系统返回', detail: '发送 Android 返回键。' },
  { name: '主页事件', use: '返回桌面', detail: '发送 Android Home 键并回到系统主界面。' },
  { name: '打开应用', use: '冷启动应用', detail: '自动识别前台应用并保存包名与 Activity，默认先停止残留进程再启动。' },
  { name: '反馈事件', use: '成功截图邮件', detail: '截取当前手机画面，任务成功后由平台按通知设置发送邮件附件。' },
]

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function navigate(tab: string) {
  emit('navigate', tab)
}
</script>

<template>
  <el-drawer v-model="visible" size="min(960px, 90vw)" :with-header="false" append-to-body>
    <div class="guide-shell">
      <header class="guide-header">
        <div>
          <span>AL-1S · USER GUIDE · 0.16.0</span>
          <h2>AL-1S 脚本站使用说明</h2>
          <p>脚本编辑、任务调度、失败取证和创龙 NPU 终端部署指南</p>
        </div>
        <el-button circle aria-label="关闭使用说明" @click="visible = false">×</el-button>
      </header>

      <div class="guide-layout">
        <aside class="guide-nav">
          <strong>目录</strong>
          <button v-for="section in sections" :key="section.id" type="button" @click="scrollToSection(section.id)">
            {{ section.label }}
          </button>
          <small>说明内嵌在平台镜像中，随版本一起更新，不依赖外部网站。</small>
        </aside>

        <article class="guide-content">
          <section id="guide-quick-start" class="guide-section guide-intro">
            <span class="section-kicker">QUICK START</span>
            <h3>从零开始运行一条脚本</h3>
            <p class="lead">先确认终端和手机，再在脚本编辑器中保存一个最小流程，最后从任务中心正式下发。调试当前内容时使用“临时测试”，它不会保存任务或生成失败证据。</p>
            <ol class="guide-steps">
              <li><b>确认终端</b><span>打开“终端工作台”，确认创龙终端为 online，Android 设备显示 ADB 在线。</span></li>
              <li><b>锁定手机</b><span>进入“脚本编辑器”，选择终端并连接会话。编辑期间手机会被锁定，避免任务或其他会话切换设备。</span></li>
              <li><b>准备画面</b><span>“远程控制”用于操作手机；“脚本标注”用于截取模板。无损截图只在点击“刷新无损截图”时更新。</span></li>
              <li><b>编排流程</b><span>脚本从“开始”步骤起步，点击步骤之间的小型加号添加等待、点击、滑动、返回、主页或打开应用。</span></li>
              <li><b>保存或试跑</b><span>“保存脚本”写入脚本库；“临时测试”直接运行当前内容，不保存、不计入任务统计、不生成失败记录。</span></li>
              <li><b>正式下发</b><span>到“任务中心”选择普通任务或脚本组合任务，设置执行方式、录屏和失败重试次数后下发。</span></li>
            </ol>
            <div class="guide-actions">
              <el-button type="primary" @click="navigate('editor')">打开脚本编辑器</el-button>
              <el-button @click="navigate('tasks')">打开任务中心</el-button>
              <el-button @click="navigate('terminals')">查看终端</el-button>
            </div>
          </section>

          <section id="guide-pages" class="guide-section">
            <span class="section-kicker">CONTROL CENTER</span>
            <h3>页面分别负责什么</h3>
            <div class="feature-grid">
              <div><b>终端工作台</b><p>查看终端心跳、手机、ADB、电量、Root 和任务接收状态。可以暂停/恢复接收任务、执行手机诊断；创龙 RK3576 NPU 终端还会显示容器部署入口。</p></div>
              <div><b>任务中心</b><p>普通任务按脚本分别排队；脚本组合视为一条完整任务。支持单次、循环、定时、录屏、失败重试、取消和已完成记录删除。</p></div>
              <div><b>失败记录</b><p>保存失败步骤、组合脚本位置、错误信息、邮件状态和现场截图。确认后不再计入左侧未处理失败统计，删除后记录和截图都会移除。</p></div>
              <div><b>脚本编辑器</b><p>锁定终端和手机，使用 scrcpy 远程控制，用无损截图标注图片、坐标和滑动轨迹，再保存为 JSON 脚本。</p></div>
              <div><b>通知设置</b><p>配置 SMTP、失败收件人和平台访问地址。失败邮件状态现在显示在“邮件发送器”区域，不再放在页面顶部。</p></div>
            </div>
            <div class="guide-callout"><b>数据保存位置</b><p>平台任务、失败记录、截图、录屏、通知密钥和终端镜像缓存都保存在 Docker 数据卷 <code>maa-platform-data</code> 中。重建容器不会清空这些数据。</p></div>
          </section>

          <section id="guide-editor" class="guide-section">
            <span class="section-kicker">SCRIPT EDITOR</span>
            <h3>脚本编辑器的当前工作流</h3>
            <h4>先选终端，再进入编辑会话</h4>
            <p>选择终端并连接/锁定手机后，左侧提供“远程控制”和“脚本标注”。远程控制的点击、滑动、返回和主页操作不会写入脚本；脚本标注才会产生模板、坐标或轨迹。</p>

            <h4>脚本库、当前脚本和脚本类型</h4>
            <ul>
              <li>载入脚本时必须先选择应用分类，再选择对应脚本。脚本列表只展示当前分类，避免把其他游戏的脚本混在一起。</li>
              <li>保存脚本时，包含“打开应用”的开始脚本会按 Android 包名自动匹配应用分类；没有开始/打开应用的过程脚本可以手动移动到分类。</li>
              <li>“普通脚本”独立执行，不能放进组合任务；“开始脚本”必须包含【开始】和【打开应用】；“过程脚本”不能包含二者。</li>
              <li>过程脚本可以选择“结束时清理并关闭应用”。启用清理的过程脚本只能放在组合任务最后，未启用时可放在中间继续下一模块。</li>
              <li>脚本名称支持中文和空格，页面隐藏 `.json` 后缀；脚本库支持保存、载入、上传、下载、移动分类和删除。</li>
            </ul>

            <h4>保存脚本和临时测试</h4>
            <p>“保存脚本”只保存当前内容，不执行。“临时测试”直接下发当前未保存内容，可单次或循环执行；它不保存脚本、不创建正式任务、不生成失败截图/失败记录/失败邮件，结束后保留当前应用现场。</p>

            <h4>独立规则</h4>
            <p>“独立规则”不再放在开始步骤前，而是位于脚本类型右侧的独立区域。规则可以指定一个或多个事件生效，也可以使用“全选（全部步骤）”。它用于脚本运行期间识别并关闭独立事件触发的弹窗，不占用步骤编号。</p>
            <p>每条规则分别配置弹窗识别目标和关闭位置：关闭位置可以是单独截取的图片，也可以是固定坐标。规则下拉列表只在添加规则后显示；可单独试运行或删除规则。</p>

            <h4>步骤级功能</h4>
            <ul>
              <li>除“开始”外，事件可以开启条件跳过：OCR 读取紫色区域数字，或匹配紫色区域图片；条件满足时可只跳过当前事件，也可连同后续事件一起跳过，并发送邮件通知。</li>
              <li>事件可以开启执行后断言：用红色区域截取成功后应出现的图片。断言超时会从当前事件开头重跑，超过上限后任务失败。</li>
              <li>事件可以配置失败重试过程脚本。当前步骤正常成功时不会调用恢复脚本；每次失败会先完整执行一次恢复过程脚本，成功后再重试当前步骤。</li>
              <li>每个事件和独立规则旁边的播放按钮只执行一次，便于调试；单步执行不会执行整条流程的结束清理。</li>
            </ul>
          </section>

          <section id="guide-events" class="guide-section">
            <span class="section-kicker">EVENT REFERENCE</span>
            <h3>流水线事件速查</h3>
            <div class="event-table">
              <div class="event-row event-head"><span>事件</span><span>适用场景</span><span>行为</span></div>
              <div v-for="item in events" :key="item.name" class="event-row">
                <b>{{ item.name }}</b><span>{{ item.use }}</span><p>{{ item.detail }}</p>
              </div>
            </div>
            <div class="guide-tip"><b>稳定性建议</b><span>模板截取稳定、有辨识度的小区域；避开时间、电量、动画和大面积纯色背景。页面切换后加入等待，固定坐标要与手机实际分辨率匹配。</span></div>
          </section>

          <section id="guide-tasks" class="guide-section">
            <span class="section-kicker">TASKS & RETRIES</span>
            <h3>任务、队列和组合重试</h3>
            <ul>
              <li>同一终端同一时间只执行一个任务，任务按进入顺序 FIFO 排队；暂停接收只影响领取新任务，不会中断当前任务。</li>
              <li>普通任务会按选择顺序分别创建记录；脚本组合视为一条任务，组合内部的模块不会被其他任务插队。</li>
              <li>每次循环和失败重试都会创建新的运行记录。重试进入队尾，原记录和现场截图不会被覆盖。</li>
              <li>失败任务可以在任务中心直接重试，即使创建时没有设置自动重试次数。</li>
            </ul>
            <h4>组合脚本的断点重试</h4>
            <p>组合脚本例如“开始 → A → B → C → 结束清理”在 B 失败后重试时，会重新执行开始脚本，跳过已经成功的 A，从 B 继续。这个跳过标记跟随任务记录保存，不依赖手机系统重置。</p>
            <p>任务详情会标记“重试固定执行”“重试已跳过”和“断点继续位置”。如果无法定位失败模块，才会整组重试；如果队列中的其他任务改变了手机现场，开始脚本会重新建立基线。</p>
            <h4>任务记录和存储清理</h4>
            <p>已完成或失败的任务可以单独删除；“存储与清理”可以按时间批量清理已完成任务历史或录屏缓存。清理失败取证需要额外勾选，避免误删现场截图。</p>
            <div class="guide-actions"><el-button type="primary" @click="navigate('tasks')">打开任务中心</el-button></div>
          </section>

          <section id="guide-failures" class="guide-section">
            <span class="section-kicker">FAILURE EVIDENCE</span>
            <h3>失败记录、确认和邮件</h3>
            <p>步骤失败时，终端先在错误现场截图，再清理本次启动过的应用并返回主页。平台保存失败位置、错误、清理结果、邮件状态和截图。</p>
            <ul>
              <li>失败位置会尽量显示为“组合脚本 #02 · 第 03 步”或对应模块名称，普通脚本显示步骤编号和动作。</li>
              <li>点击“确认”表示已经处理该失败；确认记录仍保留，但不会继续显示在左侧失败次数统计中。</li>
              <li>点击“删除”会永久删除失败记录及现场截图，删除后也不会再计入失败统计。</li>
              <li>任务记录和失败记录是两套数据：删除任务不会自动删除失败记录，失败记录需要在“失败记录”页面单独确认或删除。</li>
              <li>通知设置中填写 SMTP、应用专用密码、发件人和收件人后，先点击“发送测试邮件”。失败邮件启用状态显示在邮件发送器卡片右侧。</li>
            </ul>
            <div class="guide-actions">
              <el-button @click="navigate('failures')">打开失败记录</el-button>
              <el-button @click="navigate('notifications')">配置邮件通知</el-button>
            </div>
          </section>

          <section id="guide-terminal" class="guide-section">
            <span class="section-kicker">TERMINAL DEPLOYMENT</span>
            <h3>创龙 RK3576 NPU 容器部署</h3>
            <p>当前只支持带 NPU 的创龙 RK3576 ARM64 终端。手机不需要单独部署软件：在终端安装 ADB，并通过 USB 连接开启调试的 Android 手机即可。</p>
            <h4>首次部署：只做一次主机初始化</h4>
            <ol class="guide-steps">
              <li><b>平台地址</b><span>平台 `.env` 设置终端可以访问的 <code>PUBLIC_BASE_URL</code> 或 <code>TERMINAL_DEPLOY_PUBLIC_URL</code>，例如 <code>http://192.168.5.3:8000</code>。</span></li>
              <li><b>安装部署器</b><span>在项目根目录执行 <code>.\scripts\install-terminal-deployer.ps1 -BoardHost 192.168.5.21</code>，上传主机侧部署器和 Compose 文件。</span></li>
              <li><b>设置令牌</b><span>在开发板编辑 <code>deploy/terminal/env.deployer</code>，将 <code>DEPLOYER_TOKEN</code> 设置为平台 <code>AGENT_TOKEN</code>，再执行 <code>systemctl restart maa-terminal-deployer</code>。</span></li>
              <li><b>检查服务</b><span>执行 <code>curl http://127.0.0.1:8767/health</code>。部署器运行在终端主机上，不把 Docker Socket 挂进 Agent 容器。</span></li>
            </ol>
            <h4>平台端部署</h4>
            <p>在创龙 NPU 终端卡片点击“部署 NPU 容器”，第一次上传 <code>al1s-terminal-agent-npu-arm64.tar</code>。平台保存镜像并计算 SHA-256；之后选择已有缓存即可。部署过程会下载缓存、校验、导入镜像、重建容器并等待健康检查，失败会自动回滚旧镜像。</p>
            <p>缓存位于平台 Docker 数据卷的 <code>/app/data/terminal-deploy</code>，现有 <code>platform.ps1 export</code> / <code>platform.sh export</code> 会把它一起带走，减少终端访问 Docker Hub、GitHub 和 PyPI。</p>
            <div class="guide-callout"><b>Beta 限制</b><p>首次安装部署器仍需要通过 SSH 或脚本完成；当前不支持普通 x86、非创龙或无 NPU 终端。部署前请确认没有正在执行的任务。</p></div>
          </section>

          <section id="guide-troubleshooting" class="guide-section">
            <span class="section-kicker">TROUBLESHOOTING</span>
            <h3>常见问题和使用边界</h3>
            <details open><summary>终端一直离线</summary><p>先检查平台地址和 Agent Token。若日志出现 <code>401 Unauthorized</code>，说明令牌不一致；若 Agent 可访问平台健康接口但仍离线，检查注册接口地址和容器内的环境文件。</p></details>
            <details><summary>容器启动时报 iptables raw table 不存在</summary><p>精简开发板内核可能没有 Docker bridge 所需的 raw 表。当前 NPU Compose 使用 host 网络模式，先执行 <code>docker compose ... down</code> 再重新 <code>up -d</code>，不要改回默认 bridge 网络。</p></details>
            <details><summary>容器在线但手机未连接</summary><p>在开发板执行 <code>adb devices</code>，确认手机已授权且状态为 <code>device</code>。USB 连接、调试授权和 ADB 安装仍由终端用户负责。</p></details>
            <details><summary>出现 global popup step index out of range</summary><p>这是独立规则保存的步骤范围与当前流水线不一致。打开对应独立规则，使用“全选（全部步骤）”或“清空”后重新选择生效步骤，再保存脚本。</p></details>
            <details><summary>图片识别不到或循环执行不稳定</summary><p>确认截图和当前分辨率、主题一致，重新刷新无损截图并截取稳定的小区域；适当调整匹配阈值、等待时间和轮询间隔。</p></details>
            <details><summary>终端 NPU 部署失败</summary><p>检查平台地址是否能从开发板访问、部署器 <code>8767</code> 端口是否可达、令牌是否一致，并查看 <code>journalctl -u maa-terminal-deployer -f</code>。部署失败会保留旧镜像并尝试回滚。</p></details>
            <details><summary>夜间模式或页面显示异常</summary><p>主题选择保存在浏览器本地。重新加载平台后仍异常时清除该站点的本地存储，再重新选择日间或夜间模式。</p></details>
            <h4>安全边界</h4>
            <ul>
              <li>当前是单平台、单终端、单手机的 Beta 方案，默认 Agent Token 和平台 API 尚未提供完整用户登录体系。</li>
              <li>跨机器使用时应设置真实局域网地址，并在可信网络或 HTTPS/WSS 环境中运行，不要把 ADB、部署器或实时控制端口暴露到公网。</li>
              <li>通知密码使用 Docker 数据卷中的独立密钥加密保存；备份和导出包包含敏感数据，应妥善保管。</li>
            </ul>
          </section>
        </article>
      </div>
    </div>
  </el-drawer>
</template>

<style scoped>
.guide-shell{min-height:100%;background:#0b131d;color:#dce6f3}.guide-header{position:sticky;top:0;z-index:3;display:flex;align-items:center;justify-content:space-between;gap:18px;padding:24px 28px;border-bottom:1px solid #26384b;background:#0d1722f2;backdrop-filter:blur(14px)}.guide-header>div{display:grid;gap:5px}.guide-header span,.section-kicker{color:#52d2b8;font:10px ui-monospace,monospace;letter-spacing:.16em}.guide-header h2{margin:0;font-size:23px}.guide-header p{margin:0;color:#7d90a5;font-size:12px}.guide-layout{display:grid;grid-template-columns:180px minmax(0,1fr);align-items:start}.guide-nav{position:sticky;top:114px;display:grid;gap:5px;padding:24px 16px 24px 24px}.guide-nav strong{margin-bottom:7px;color:#63778e;font-size:10px;letter-spacing:.14em}.guide-nav button{border:0;border-left:2px solid #263a4e;background:transparent;color:#8fa1b4;padding:8px 11px;text-align:left;cursor:pointer}.guide-nav button:hover{border-color:#51d0b6;color:#64ddc5;background:#102522}.guide-nav small{margin-top:15px;color:#5f7287;font-size:9px;line-height:1.6}.guide-content{min-width:0;padding:8px 30px 60px 18px}.guide-section{scroll-margin-top:125px;padding:32px 0;border-bottom:1px solid #203043}.guide-section:last-child{border-bottom:0}.guide-section h3{margin:7px 0 15px;font-size:21px}.guide-section h4{margin:22px 0 7px;font-size:13px;color:#d3deea}.guide-section>p,.guide-section li{color:#91a3b5;font-size:12px;line-height:1.8}.guide-section code{padding:2px 5px;border:1px solid #2b4651;border-radius:4px;background:#0b2424;color:#65d8c1;font:11px ui-monospace,monospace}.lead{max-width:720px;color:#adbdcc!important;font-size:13px!important}.guide-steps{display:grid;gap:9px;margin:20px 0;padding:0;counter-reset:step;list-style:none}.guide-steps li{display:grid;grid-template-columns:125px 1fr;gap:12px;padding:12px 14px;border:1px solid #263b4f;border-radius:8px;background:#101b27}.guide-steps b{color:#dbe6f1}.guide-steps b:before{counter-increment:step;content:counter(step);display:inline-grid;place-items:center;width:20px;height:20px;margin-right:8px;border:1px solid #39786e;border-radius:50%;color:#59d2ba;font:10px ui-monospace,monospace}.guide-actions{display:flex;flex-wrap:wrap;gap:9px;margin-top:18px}.feature-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.feature-grid>div{padding:14px;border:1px solid #273b4e;border-radius:9px;background:#101a25}.feature-grid b{color:#d8e3ee;font-size:13px}.feature-grid p{margin:6px 0 0;color:#8194a8;font-size:11px;line-height:1.65}.guide-callout,.guide-tip{padding:14px;border:1px solid #326359;border-radius:9px;background:#102625}.guide-callout{margin-top:14px}.guide-callout b,.guide-tip b{color:#61d6bf;font-size:12px}.guide-callout p{margin:6px 0 0;color:#91aaa8;font-size:11px;line-height:1.7}.event-table{overflow:hidden;border:1px solid #2a3f53;border-radius:9px}.event-row{display:grid;grid-template-columns:110px 125px 1fr;align-items:center;gap:12px;min-height:53px;padding:9px 12px;border-bottom:1px solid #223447;color:#8295a9;font-size:11px}.event-row:last-child{border-bottom:0}.event-row b{color:#d9e4ee}.event-row p{margin:0;line-height:1.55}.event-head{min-height:38px;background:#142231;color:#61768b;font-size:9px;letter-spacing:.1em}.guide-tip{display:flex;gap:10px;margin-top:13px}.guide-tip span{color:#90a6a3;font-size:11px;line-height:1.65}.guide-section details{margin:8px 0;border:1px solid #293d50;border-radius:8px;background:#0f1924}.guide-section summary{padding:12px 14px;cursor:pointer;color:#cbd8e4;font-size:12px}.guide-section details p{margin:0;padding:0 14px 13px;color:#8295aa;font-size:11px;line-height:1.7}.guide-section ul{padding-left:20px}@media(max-width:760px){.guide-layout{grid-template-columns:1fr}.guide-nav{position:static;grid-template-columns:repeat(2,1fr);padding:16px 20px}.guide-nav strong,.guide-nav small{grid-column:1/-1}.guide-content{padding:0 20px 50px}.feature-grid{grid-template-columns:1fr}.event-row{grid-template-columns:90px 1fr}.event-row p{grid-column:1/-1}.guide-steps li{grid-template-columns:1fr}}
</style>
