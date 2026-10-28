import { ApiError } from '../../shared/api/client'
import { confirmFailure, downloadFailureScreenshot, type AttemptDetail } from '../../shared/api/task-details'

/** One drawer/task session; the server remains authoritative for earlier downloads. */
export class FailureReview {
  private retryRequired = new Set<string>()

  constructor(private task: string) {}

  async download(attempt: string, artifact: string) {
    const key = `${attempt}/${artifact}`
    try {
      await downloadFailureScreenshot(this.task, attempt, artifact)
      this.retryRequired.delete(key)
    } catch (error) {
      this.retryRequired.add(key)
      throw error
    }
  }

  async complete(attempt: AttemptDetail, isCurrent: () => boolean): Promise<boolean> {
    const ids = [...new Set(attempt.details.flatMap(detail => detail.screenshot_id ? [detail.screenshot_id] : []))]
    if (ids.some(id => this.retryRequired.has(`${attempt.attempt_id}/${id}`))) {
      throw new Error('截图校验失败，请手动重新下载成功后再确认')
    }
    if (!isCurrent()) return false
    try {
      await confirmFailure(this.task, attempt.attempt_id)
      return isCurrent()
    } catch (error) {
      if (error instanceof ApiError && error.code === 'screenshot_download_required') {
        throw new Error('请先手动下载全部失败原图，再确认清理详情')
      }
      throw error
    }
  }
}
