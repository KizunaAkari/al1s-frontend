import type { BotAlias } from '../../shared/api/bot-updates'
type UpdateRequest = { alias: BotAlias; generation: number }
export class BotUpdateSession {
  private generation = 0
  private closed = false
  constructor(private alias: BotAlias) {}
  select(alias: BotAlias): void { this.alias = alias; this.generation++ }
  capture(): UpdateRequest { return { alias: this.alias, generation: this.generation } }
  current(request: UpdateRequest): boolean {
    return !this.closed && request.alias === this.alias && request.generation === this.generation
  }
  close(): void { this.closed = true; this.generation++ }
}
