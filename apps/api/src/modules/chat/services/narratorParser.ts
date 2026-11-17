const resolutionOpen = '<resolution>';
const resolutionClose = '</resolution>';
const proseOpen = '<prose>';
const proseClose = '</prose>';

export type Narration = {
  resolution: string;
  prose: string;
};

function trailingTagPrefixLength(value: string, tag: string): number {
  const maximum = Math.min(value.length, tag.length - 1);
  for (let length = maximum; length > 0; length -= 1) {
    if (tag.startsWith(value.slice(-length))) return length;
  }
  return 0;
}

export class NarratorStreamParser {
  private phase: 'resolution-open' | 'resolution' | 'prose-open' | 'prose' | 'done' = 'resolution-open';
  private pending = '';
  private raw = '';
  private resolution = '';
  private prose = '';

  constructor(private readonly onProse: (delta: string) => Promise<void>) {}

  async push(delta: string): Promise<void> {
    this.raw += delta;
    this.pending += delta;
    await this.consume();
  }

  finish(content: string): Narration {
    if (content !== this.raw || this.phase !== 'done' || this.pending
      || !this.resolution.trim() || !this.prose.trim()) {
      throw new Error('Narrator response must contain non-empty resolution and prose sections.');
    }
    return { resolution: this.resolution, prose: this.prose };
  }

  private async consume(): Promise<void> {
    while (true) {
      if (this.phase === 'resolution-open' || this.phase === 'prose-open') {
        const tag = this.phase === 'resolution-open' ? resolutionOpen : proseOpen;
        if (this.pending.length < tag.length && tag.startsWith(this.pending)) return;
        if (!this.pending.startsWith(tag)) throw new Error(`Narrator response is missing ${tag}.`);
        this.pending = this.pending.slice(tag.length);
        this.phase = this.phase === 'resolution-open' ? 'resolution' : 'prose';
        continue;
      }

      if (this.phase === 'resolution') {
        const end = this.pending.indexOf(resolutionClose);
        if (end !== -1) {
          this.resolution += this.pending.slice(0, end);
          this.pending = this.pending.slice(end + resolutionClose.length);
          if (!this.resolution.trim()) throw new Error('Narrator resolution cannot be empty.');
          this.phase = 'prose-open';
          continue;
        }
        const safeLength = this.pending.length - trailingTagPrefixLength(this.pending, resolutionClose);
        this.resolution += this.pending.slice(0, safeLength);
        this.pending = this.pending.slice(safeLength);
        return;
      }

      if (this.phase === 'prose') {
        const end = this.pending.indexOf(proseClose);
        if (end !== -1) {
          const delta = this.pending.slice(0, end);
          await this.emitProse(delta);
          this.pending = this.pending.slice(end + proseClose.length);
          this.phase = 'done';
          if (this.pending) throw new Error('Narrator response contains content after the prose section.');
          return;
        }
        const safeLength = this.pending.length - trailingTagPrefixLength(this.pending, proseClose);
        const delta = this.pending.slice(0, safeLength);
        await this.emitProse(delta);
        this.pending = this.pending.slice(safeLength);
        return;
      }

      if (this.pending) throw new Error('Narrator response contains content after the prose section.');
      return;
    }
  }

  private async emitProse(delta: string): Promise<void> {
    if (!delta) return;
    this.prose += delta;
    await this.onProse(delta);
  }
}
