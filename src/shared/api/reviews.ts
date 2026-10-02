import { apiClient } from './client'

export type Review = {
  id: string; service_id: string; message_id: string; state: string;
  received_at: string; row_version: number; lexicon_commit: string | null; intent_id: string | null;
  failure_reason?: 'source_not_allowed' | 'manual_rejection' | null;
}
export type ReviewDetail = Review & {
  body_available: boolean; document?: { original: string; text: string; matches: string[] } | null;
}
export async function fetchReviews(state?: string, cursor?: string) {
  return (await apiClient.get<{ items: Review[]; next_cursor: string | null }>(
    '/notifications/reviews', { params: { state, cursor, limit: 50 } },
  )).data
}
export async function fetchReview(id: string) {
  return (await apiClient.get<ReviewDetail>(`/notifications/reviews/${encodeURIComponent(id)}`)).data
}
export async function approveReview(review: Review, text: string | null) {
  return (await apiClient.post<Review>(`/notifications/reviews/${review.id}/approve`,
    { row_version: review.row_version, text })).data
}
export async function batchReviews(ids: string[], action: 'reject' | 'delete') {
  return (await apiClient.post<Array<{ id: string; accepted: boolean }>>(
    '/notifications/reviews/batch', { ids, action },
  )).data
}
