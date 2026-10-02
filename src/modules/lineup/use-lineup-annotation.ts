import { computed, onBeforeUnmount, ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import { fetchLineupImage } from '../../shared/api/lineup'
import { exportLineupAnnotation, fetchLineupAnnotation, saveLineupAnnotation, type AnnotationDocument, type WorkspaceDetail } from '../../shared/api/lineup-workspace'
import { annotationFromDetail, cloneAnnotation } from './annotation-draft'

export function useLineupAnnotation() {
  const detail = ref<WorkspaceDetail | null>(null), imageUrl = ref('')
  const document = ref<AnnotationDocument>({ teams: {}, slots: [] })
  const baseline = ref(''), busy = ref(false), loading = ref(false), error = ref(''), notice = ref('')
  const dirty = computed(() => !!detail.value && JSON.stringify(document.value) !== baseline.value)
  let generation = 0
  function setDetail(value: WorkspaceDetail) {
    detail.value = value; document.value = annotationFromDetail(value)
    baseline.value = JSON.stringify(document.value)
  }
  async function save(): Promise<boolean> {
    if (!detail.value || busy.value || loading.value) return false
    busy.value = true; error.value = ''; notice.value = ''
    try {
      const value = await saveLineupAnnotation(detail.value.id, detail.value.annotation?.version ?? 0, cloneAnnotation(document.value))
      setDetail(value)
      notice.value = value.annotation?.state === 'confirmed' ? '纠错与标注已保存，图片已可用。' : '标注草稿已保存，仍有位置需要填写。'
      return true
    } catch (cause) { error.value = cause instanceof Error ? cause.message : '保存失败'; return false }
    finally { busy.value = false }
  }
  async function canLeave(): Promise<boolean> {
    if (busy.value) return false
    if (!dirty.value) return true
    try {
      await ElMessageBox.confirm('当前图片有未保存修改。', '切换图片', {
        confirmButtonText: '保存并继续', cancelButtonText: '放弃修改', distinguishCancelAndClose: true,
      })
      return save()
    } catch (action) { if (action === 'cancel') { reset(); return true }; return false }
  }
  async function open(recordId: string, taskId?: string): Promise<boolean> {
    if (!await canLeave()) return false
    const current = ++generation
    loading.value = true; error.value = ''; notice.value = ''
    if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
    imageUrl.value = ''; detail.value = null
    try {
      const value = await fetchLineupAnnotation(recordId, taskId)
      if (current !== generation) return false
      setDetail(value)
      const image = await fetchLineupImage(recordId)
      if (current !== generation) return false
      imageUrl.value = URL.createObjectURL(image)
      return true
    } catch (cause) { if (current === generation) error.value = cause instanceof Error ? cause.message : '读取标注失败'; return false }
    finally { if (current === generation) loading.value = false }
  }
  function clear() {
    generation++
    if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
    imageUrl.value = ''; detail.value = null; document.value = { teams: {}, slots: [] }
    baseline.value = ''; error.value = ''; notice.value = ''; loading.value = false
  }
  async function retryImage() {
    if (!detail.value || loading.value) return
    const id = detail.value.id, current = generation
    loading.value = true; error.value = ''
    try {
      const image = await fetchLineupImage(id)
      if (current === generation && detail.value?.id === id) {
        if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
        imageUrl.value = URL.createObjectURL(image)
      }
    } catch (cause) { if (current === generation) error.value = cause instanceof Error ? cause.message : '原图读取失败' }
    finally { if (current === generation) loading.value = false }
  }
  function reset() { if (detail.value) { document.value = JSON.parse(baseline.value) as AnnotationDocument; error.value = '' } }
  async function download() {
    if (!detail.value || busy.value) return
    if (dirty.value) { error.value = '请先保存修改，再导出标注'; return }
    busy.value = true; error.value = ''
    try {
      const blob = await exportLineupAnnotation(detail.value.id)
      const url = URL.createObjectURL(blob), link = window.document.createElement('a')
      link.href = url; link.download = `annotation-${detail.value.id}.zip`; link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (cause) { error.value = cause instanceof Error ? cause.message : '导出失败' }
    finally { busy.value = false }
  }
  const unload = (event: BeforeUnloadEvent) => { if (dirty.value) { event.preventDefault(); event.returnValue = '' } }
  window.addEventListener('beforeunload', unload)
  onBeforeUnmount(() => { generation++; window.removeEventListener('beforeunload', unload); if (imageUrl.value) URL.revokeObjectURL(imageUrl.value) })
  return { detail, imageUrl, document, dirty, busy, loading, error, notice, save, open, canLeave, reset, download, clear, retryImage }
}
