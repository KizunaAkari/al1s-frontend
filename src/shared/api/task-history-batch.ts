import { deleteTaskHistory, type TaskHistoryItem } from './tasks'

export const MAX_HISTORY_BATCH = 50
export type HistoryDeletionResult = { id: string; name: string; deleted: boolean; message: string }

export async function deleteHistoryBatch(
  tasks: TaskHistoryItem[],
  remove: typeof deleteTaskHistory = deleteTaskHistory,
): Promise<HistoryDeletionResult[]> {
  const unique = [...new Map(tasks.map((task) => [task.task_id, task])).values()]
  if (unique.length === 0 || unique.length > MAX_HISTORY_BATCH) {
    throw new Error('请选择1～50条任务历史')
  }
  const results: HistoryDeletionResult[] = []
  // Deliberately bounded and sequential: reuse server ownership/version/resource checks.
  // A failed request is never automatically retried or converted into cancellation.
  for (const task of unique) {
    let deleted = false
    let message = task.delete.refusal_message ?? '当前状态不允许删除'
    if (task.delete.allowed) {
      try {
        await remove(task)
        deleted = true
        message = '已删除'
      } catch {
        message = '未确认删除成功，请刷新核对；状态变化或网络异常均不会自动重试'
      }
    }
    results.push({ id: task.task_id, name: task.name, deleted, message })
  }
  return results
}
