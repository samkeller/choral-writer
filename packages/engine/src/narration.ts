import { resolutionSchema, type Resolution } from './contracts.js';

export class NarrationParser {
  private buffer = '';
  private phase: 'resolution' | 'open-prose' | 'prose' | 'done' = 'resolution';
  private resolutionValue?: Resolution;

  constructor(private readonly emit: (text: string) => void | Promise<void>) {}

  async push(chunk: string): Promise<void> {
    this.buffer += chunk;
    if (this.phase === 'resolution') {
      const end = this.buffer.indexOf('</resolution>');
      if (end < 0) {
        if (this.buffer.length > 100_000) throw new Error('Resolution exceeds size limit');
        return;
      }
      const prefix = this.buffer.slice(0, end).trim();
      if (!prefix.startsWith('<resolution>')) throw new Error('Narration must start with resolution');
      this.resolutionValue = resolutionSchema.parse(JSON.parse(prefix.slice('<resolution>'.length).trim()));
      this.buffer = this.buffer.slice(end + '</resolution>'.length);
      this.phase = 'open-prose';
    }
    if (this.phase === 'open-prose') {
      this.buffer = this.buffer.trimStart();
      if (this.buffer.length < '<prose>'.length) return;
      if (!this.buffer.startsWith('<prose>')) throw new Error('Narration must contain prose');
      this.buffer = this.buffer.slice('<prose>'.length);
      this.phase = 'prose';
    }
    if (this.phase === 'prose') {
      const end = this.buffer.indexOf('</prose>');
      if (end >= 0) {
        await this.emit(this.buffer.slice(0, end));
        this.buffer = this.buffer.slice(end + '</prose>'.length);
        this.phase = 'done';
      } else {
        const safe = Math.max(0, this.buffer.length - ('</prose>'.length - 1));
        if (safe) {
          await this.emit(this.buffer.slice(0, safe));
          this.buffer = this.buffer.slice(safe);
        }
      }
    }
    if (this.phase === 'done' && this.buffer.trim()) throw new Error('Unexpected text after prose');
  }

  finish(): Resolution {
    if (this.phase !== 'done' || !this.resolutionValue) throw new Error('Incomplete narration');
    return this.resolutionValue;
  }
}
