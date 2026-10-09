export class PreviewSession<Input, Output> {
  private generation = 0
  private timer: ReturnType<typeof setTimeout> | undefined
  private controller: AbortController | undefined
  private closed = false
  constructor(private readonly render: (input: Input, signal: AbortSignal) => Promise<Output>,
    private readonly apply: (result: Output) => void, private readonly fail?: (error: unknown) => void) {}
  schedule(input: Input): void {
    if (this.closed) return
    const generation = ++this.generation
    clearTimeout(this.timer)
    this.controller?.abort()
    this.controller = new AbortController()
    const controller = this.controller
    this.timer = setTimeout(async () => {
      try {
        const result = await this.render(input, controller.signal)
        if (!this.closed && generation === this.generation) this.apply(result)
      } catch (error) {
        if (!controller.signal.aborted && !this.closed && generation === this.generation) this.fail?.(error)
      }
    }, 300)
  }
  close(): void {
    this.closed = true
    ++this.generation
    clearTimeout(this.timer)
    this.controller?.abort()
  }
}
