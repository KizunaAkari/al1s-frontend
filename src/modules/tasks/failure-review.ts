import { ApiError } from '../../shared/api/client'
import { confirmFailure, downloadFailureScreenshot, type AttemptDetail } from '../../shared/api/task-details'

/** One drawer/task session; the server remains authoritative for earlier downloads. */
export class FailureReview {
  private downloaded = new Set<string>()
  private retryRequired = new Set<string>()

  constructor(private task: string) {}

  async download(attempt: string, artifact: string) {
    const key = `${attempt}/${artifact}`
    try {
      await downloadFailureScreenshot(this.task, attempt, artifact)
      this.downloaded.add(key)
      this.retryRequired.delete(key)
    } catch (error) {
      this.retryRequired.add(key)
      throw error
    }
  }

  async complete(attempt: AttemptDetail, isCurrent: () => boolean): Promise<boolean> {
    const ids = [...new Set(attempt.details.flatMap(detail => detail.screenshot_id ? [detail.screenshot_id] : []))]
    // A completed HTTP stream is insufficient if browser verification failed.
    for (const id of ids) {
      if (!isCurrent()) return false
      if (this.retryRequired.has(`${attempt.attempt_id}/${id}`)) await this.download(attempt.attempt_id, id)
    }
    if (!isCurrent()) return false
    try {
      await confirmFailure(this.task, attempt.attempt_id)
      return isCurrent()
    } catch (error) {
      if (!(error instanceof ApiError) || error.code !== 'screenshot_download_required') throw error
    }
    for (const id of ids) {
      if (!isCurrent()) return false
      if (!this.downloaded.has(`${attempt.attempt_id}/${id}`)) await this.download(attempt.attempt_id, id)
    }
    if (!isCurrent()) return false
    if (!ids.length) throw new Error('截图尚未准备好，请刷新详情后重试')
    await confirmFailure(this.task, attempt.attempt_id)
    return isCurrent()
  }
}
