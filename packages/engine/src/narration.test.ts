import { describe, expect, it } from 'vitest';
import { NarrationParser } from './narration.js';

describe('NarrationParser', () => {
  it('validates a split resolution before streaming prose and hides closing tags', async () => {
    let prose = '';
    const parser = new NarrationParser(chunk => { prose += chunk; });
    const text = '<resolution>{"happened":[{"text":"Arrivée","participants":[]}],"time":{"label":"soir","elapsed_days":0.1}}</resolution><prose>Bonsoir Marie.</prose>';
    for (const char of text) await parser.push(char);
    expect(parser.finish().time.elapsed_days).toBe(0.1);
    expect(prose).toBe('Bonsoir Marie.');
  });

  it('rejects invalid resolution without emitting prose', async () => {
    let prose = '';
    const parser = new NarrationParser(chunk => { prose += chunk; });
    await expect(parser.push('<resolution>{"time":{}}</resolution><prose>Texte</prose>')).rejects.toThrow();
    expect(prose).toBe('');
  });
});
