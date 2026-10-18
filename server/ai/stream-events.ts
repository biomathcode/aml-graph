/** Shared SSE envelope for AI pipelines. */

export interface StreamEvent {
  event:
    | 'init'
    | 'status'
    | 'reasoning'
    | 'tool_start'
    | 'tool_result'
    | 'content'
    | 'card'
    | 'done'
    | 'error'
  data: any
}
