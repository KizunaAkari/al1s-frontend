<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '../api'
import { displayScriptName, scriptOptionLabel, storageScriptName } from '../script-editor'
import type { SavedScript, ScriptAuditRecord, ScriptCategory } from '../types'

const props = defineProps<{
  modelValue: boolean
  agentId: string
  scripts: SavedScript[]
  categories: ScriptCategory[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  load: [name: string]
  changed: []
}>()

const selectedCategory = ref('')
const categoryAlias = ref('')
const uploadCategory = ref('')
const uploadInput = ref<HTMLInputElement | null>(null)
const auditRecords = ref<ScriptAuditRecord[]>([])
const activeTab = ref<'scripts' | 'audit'>('scripts')
const busyAction = ref('')

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

const categoryEntries = computed(() => [{
  agent_id: props.agentId,
  package_name: '',
  display_name: '未分类',
  script_count: props.scripts.filter((script) => !script.category_package).length,
  created_at: '',
  updated_at: '',
}, ...props.categories])

const currentCategory = computed(() => (
  categoryEntries.value.find((category) => category.package_name === selectedCategory.value)
  || categoryEntries.value[0]
))

const filteredScripts = computed(() => props.scripts.filter((script) => (
  (script.category_package || '') === selectedCategory.value
)))

function categoryLabel(packageName?: string | null) {
  if (!packageName) return '未分类'
  const category = props.categories.find((item) => item.package_name === packageName)
  return category?.display_name || packageName
}

function operationLabel(operation: ScriptAuditRecord['operation']) {
  return {
    created: '创建脚本',
    updated: '保存修改',
    uploaded: '上传脚本',
    category_changed: '修改分类',
    category_renamed: '重命名分类',
    deleted: '删除脚本',
  }[operation] || operation
}

function localTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

async function loadAudit() {
  if (!props.agentId) return
  try {
    auditRecords.value = await api.scriptAudit(props.agentId)
  } catch (error) {
    ElMessage.error(`读取操作记录失败：${String(error)}`)
  }
}

function selectCategory(packageName: string) {
  selectedCategory.value = packageName
  activeTab.value = 'scripts'
}

async function saveCategoryAlias() {
  if (!selectedCategory.value) return
  const displayName = categoryAlias.value.trim()
  if (!displayName) return ElMessage.warning('分类显示名称不能为空')
  busyAction.value = 'rename-category'
  try {
    await api.renameScriptCategory(props.agentId, selectedCategory.value, displayName)
    ElMessage.success('应用分类名称已保存')
    emit('changed')
    await loadAudit()
  } catch (error) {
    ElMessage.error(`保存分类名称失败：${String(error)}`)
  } finally {
    busyAction.value = ''
  }
}

function chooseUpload() {
  uploadInput.value?.click()
}

async function uploadScript(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  busyAction.value = 'upload'
  try {
    const content = await file.text()
    const document = JSON.parse(content) as unknown
    if (!document || typeof document !== 'object') throw new Error('JSON 根节点必须是对象')
    const name = storageScriptName(file.name)
    if (props.scripts.some((script) => script.name === name)) {
      await ElMessageBox.confirm(
        `脚本“${displayScriptName(name)}”已经存在，上传会覆盖原内容。`,
        '确认覆盖脚本',
        { type: 'warning', confirmButtonText: '覆盖', cancelButtonText: '取消' },
      )
    }
    await api.importScript(props.agentId, name, content, uploadCategory.value || undefined)
    selectedCategory.value = uploadCategory.value
    ElMessage.success(`已上传 ${displayScriptName(name)}`)
    emit('changed')
    await loadAudit()
  } catch (error) {
    if (String(error).includes('cancel')) return
    ElMessage.error(`上传失败：${String(error)}`)
  } finally {
    busyAction.value = ''
  }
}

async function moveScript(script: SavedScript, categoryPackage: string) {
  const target = categoryPackage || ''
  if ((script.category_package || '') === target) return
  busyAction.value = `move:${script.name}`
  try {
    await api.moveScriptCategory(props.agentId, script.name, target || undefined)
    ElMessage.success(`已将“${displayScriptName(script.name)}”移动到${categoryLabel(target)}`)
    emit('changed')
    await loadAudit()
  } catch (error) {
    ElMessage.error(`修改分类失败：${String(error)}`)
  } finally {
    busyAction.value = ''
  }
}

async function downloadScript(script: SavedScript) {
  busyAction.value = `download:${script.name}`
  try {
    const blob = await api.downloadScript(props.agentId, script.name)
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = script.name
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  } catch (error) {
    ElMessage.error(`下载失败：${String(error)}`)
  } finally {
    busyAction.value = ''
  }
}

async function deleteScript(script: SavedScript) {
  try {
    await ElMessageBox.confirm(
      `确定删除脚本“${displayScriptName(script.name)}”吗？操作记录会保留。`,
      '删除脚本',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
    busyAction.value = `delete:${script.name}`
    await api.deleteScript(props.agentId, script.name)
    ElMessage.success('脚本已删除')
    emit('changed')
    await loadAudit()
  } catch (error) {
    if (String(error).includes('cancel')) return
    ElMessage.error(`删除失败：${String(error)}`)
  } finally {
    busyAction.value = ''
  }
}

function loadScript(name: string) {
  emit('load', name)
  visible.value = false
}

watch(currentCategory, (category) => {
  categoryAlias.value = category?.package_name ? category.display_name : ''
}, { immediate: true })

watch(() => props.modelValue, (open) => {
  if (open) void loadAudit()
})
</script>

<template>
  <el-drawer v-model="visible" title="脚本库管理" size="min(980px, 96vw)" append-to-body>
    <div class="script-manager">
      <aside class="category-sidebar">
        <div class="category-heading">
          <strong>应用分类</strong>
          <small>按 Android 包名归档</small>
        </div>
        <button
          v-for="category in categoryEntries"
          :key="category.package_name || '__unclassified__'"
          :class="{ active: selectedCategory === category.package_name }"
          @click="selectCategory(category.package_name)"
        >
          <span>{{ category.display_name }}</span>
          <b>{{ category.script_count }}</b>
          <small v-if="category.package_name">{{ category.package_name }}</small>
          <small v-else>没有指定应用的脚本</small>
        </button>
      </aside>

      <main class="manager-content">
        <header class="manager-header">
          <div>
            <strong>{{ currentCategory.display_name }}</strong>
            <code v-if="currentCategory.package_name">{{ currentCategory.package_name }}</code>
            <small v-else>上传时不选择分类，脚本会保存在这里。</small>
          </div>
          <el-button-group>
            <el-button :type="activeTab === 'scripts' ? 'primary' : 'default'" @click="activeTab = 'scripts'">脚本列表</el-button>
            <el-button :type="activeTab === 'audit' ? 'primary' : 'default'" @click="activeTab = 'audit'; loadAudit()">操作记录</el-button>
          </el-button-group>
        </header>

        <template v-if="activeTab === 'scripts'">
          <section v-if="selectedCategory" class="alias-editor">
            <div>
              <strong>分类显示名称</strong>
              <small>包名保持稳定，只修改网页中展示的中文名称。</small>
            </div>
            <el-input
              v-model="categoryAlias"
              maxlength="120"
              placeholder="例如：蔚蓝档案（国服）"
              @keyup.enter="saveCategoryAlias"
            />
            <el-button
              type="primary"
              title="保存分类显示名称；Android 包名不会改变"
              :loading="busyAction === 'rename-category'"
              @click="saveCategoryAlias"
            >保存名称</el-button>
          </section>

          <section class="upload-bar">
            <div>
              <strong>上传 JSON 脚本</strong>
              <small>上传分类是独立选择；留空时进入“未分类”。</small>
            </div>
            <el-select v-model="uploadCategory" clearable placeholder="不选择＝未分类">
              <el-option
                v-for="category in categories"
                :key="category.package_name"
                :label="`${category.display_name} · ${category.package_name}`"
                :value="category.package_name"
              />
            </el-select>
            <el-button title="选择一个本地 JSON 脚本并上传到当前平台" :loading="busyAction === 'upload'" @click="chooseUpload">选择 JSON 并上传</el-button>
            <input ref="uploadInput" type="file" accept=".json,application/json" hidden @change="uploadScript">
          </section>

          <section class="script-list">
            <div v-if="!filteredScripts.length" class="empty-scripts">这个分类中还没有脚本。</div>
            <article v-for="script in filteredScripts" :key="script.name">
              <div class="script-identity">
                <strong>{{ displayScriptName(script.name) }}</strong>
                <small>{{ scriptOptionLabel(script) }}</small>
                <code v-if="script.source_package">
                  来源：{{ script.source_package }}<template v-if="script.source_activity">/{{ script.source_activity }}</template>
                </code>
              </div>
              <div class="script-move">
                <span>移动到</span>
                <el-select
                  :model-value="script.category_package || ''"
                  title="选择后立即保存新的应用分类，并写入操作记录"
                  :loading="busyAction === `move:${script.name}`"
                  @change="moveScript(script, String($event || ''))"
                >
                  <el-option label="未分类" value="" />
                  <el-option
                    v-for="category in categories"
                    :key="category.package_name"
                    :label="category.display_name"
                    :value="category.package_name"
                  />
                </el-select>
              </div>
              <div class="script-buttons">
                <el-button size="small" type="primary" plain title="关闭脚本库，并用此脚本替换当前编辑内容" @click="loadScript(script.name)">载入编辑</el-button>
                <el-button size="small" title="下载原始 JSON 脚本到本地" :loading="busyAction === `download:${script.name}`" @click="downloadScript(script)">下载 JSON</el-button>
                <el-button size="small" type="danger" plain title="从平台删除脚本；被失败重试引用时后端会拒绝删除" :loading="busyAction === `delete:${script.name}`" @click="deleteScript(script)">删除</el-button>
              </div>
            </article>
          </section>
        </template>

        <section v-else class="audit-list">
          <div v-if="!auditRecords.length" class="empty-scripts">尚无脚本操作记录。</div>
          <article v-for="record in auditRecords" :key="record.id">
            <span>{{ operationLabel(record.operation) }}</span>
            <strong>{{ record.script_name ? displayScriptName(record.script_name) : categoryLabel(record.to_category) }}</strong>
            <p v-if="record.operation === 'category_changed'">
              {{ categoryLabel(record.from_category) }} → {{ categoryLabel(record.to_category) }}
            </p>
            <p v-else-if="record.operation === 'category_renamed'">
              {{ String(record.details.from_display_name || '') }} → {{ String(record.details.to_display_name || '') }}
            </p>
            <time>{{ localTime(record.created_at) }}</time>
          </article>
        </section>
      </main>
    </div>
  </el-drawer>
</template>

<style scoped>
.script-manager{display:grid;grid-template-columns:230px minmax(0,1fr);gap:14px;min-height:620px;color:#d7e1eb}.category-sidebar{display:flex;flex-direction:column;gap:7px;padding-right:12px;border-right:1px solid #26384a}.category-heading{display:grid;gap:3px;padding:3px 5px 10px}.category-heading strong{font-size:14px}.category-heading small{color:#718499;font-size:10px}.category-sidebar button{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 8px;padding:10px;border:1px solid #293d51;border-radius:8px;background:#0e1823;color:#bdcbd8;text-align:left;cursor:pointer}.category-sidebar button:hover,.category-sidebar button.active{border-color:#4bcdb2;background:#12302f}.category-sidebar button span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}.category-sidebar button b{color:#54d2b8;font-size:11px}.category-sidebar button small{grid-column:1/-1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#6f8295;font:9px ui-monospace,monospace}.manager-content{min-width:0}.manager-header{display:flex;align-items:center;justify-content:space-between;gap:14px;padding-bottom:12px;border-bottom:1px solid #27394b}.manager-header>div{display:grid;gap:4px;min-width:0}.manager-header strong{font-size:17px}.manager-header code,.manager-header small{overflow:hidden;text-overflow:ellipsis;color:#71879b;font-size:10px}.alias-editor,.upload-bar{display:grid;grid-template-columns:minmax(160px,1fr) minmax(220px,1.2fr) auto;align-items:center;gap:10px;padding:12px;margin-top:12px;border:1px solid #2a4154;border-radius:9px;background:#0d1823}.alias-editor>div,.upload-bar>div{display:grid;gap:3px}.alias-editor strong,.upload-bar strong{font-size:11px}.alias-editor small,.upload-bar small{color:#75899c;font-size:9px}.script-list{display:grid;gap:8px;margin-top:12px}.script-list article{display:grid;grid-template-columns:minmax(210px,1fr) minmax(180px,.7fr) auto;align-items:center;gap:12px;padding:11px;border:1px solid #293d50;border-radius:9px;background:#0e1823}.script-identity{display:grid;gap:4px;min-width:0}.script-identity strong{font-size:13px}.script-identity small,.script-identity code{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#75899c;font-size:9px}.script-move{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:7px;color:#7d91a4;font-size:9px}.script-buttons{display:flex;gap:5px}.empty-scripts{padding:40px;border:1px dashed #30465a;border-radius:9px;color:#71869a;text-align:center;font-size:12px}.audit-list{display:grid;gap:7px;margin-top:12px}.audit-list article{display:grid;grid-template-columns:80px minmax(140px,.8fr) minmax(160px,1fr) auto;align-items:center;gap:10px;padding:10px;border-bottom:1px solid #25384a}.audit-list span{color:#56cfb6;font-size:10px}.audit-list strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px}.audit-list p{margin:0;color:#8799aa;font-size:10px}.audit-list time{color:#687c90;font:9px ui-monospace,monospace}
@media(max-width:850px){.script-manager{grid-template-columns:1fr}.category-sidebar{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));padding:0 0 12px;border-right:0;border-bottom:1px solid #26384a}.category-heading{grid-column:1/-1}.alias-editor,.upload-bar{grid-template-columns:1fr}.script-list article{grid-template-columns:1fr}.script-buttons{justify-content:flex-start}.audit-list article{grid-template-columns:80px minmax(0,1fr) auto}.audit-list p{grid-column:2/-1}.manager-header{align-items:flex-start;flex-direction:column}}
.script-buttons{display:grid;grid-template-columns:1fr 1fr;min-width:176px}.script-buttons .el-button{width:100%;margin:0}.script-buttons .el-button:first-child{grid-column:1/-1}.script-move .el-select{min-width:0}
@media(max-width:520px){.category-sidebar{grid-template-columns:1fr}.script-buttons{display:grid;grid-template-columns:1fr 1fr}.script-buttons .el-button{width:100%}.script-buttons .el-button:last-child{grid-column:1/-1}.audit-list article{grid-template-columns:1fr}.audit-list p{grid-column:auto}}
</style>
