const proseOpen = '<prose>';
const proseClose = '</prose>';
const resolutionBlock = /<resolution>[\s\S]*?(?:<\/resolution>|$)/g;

/**
 * The prose of a recorded Narrator response.
 *
 * V2 records the prose alone. The MVP recorded `<resolution>…</resolution><prose>…</prose>`: the resolution is what
 * the Narrator planned to write, never what it wrote, so it is never returned, even from a malformed response.
 */
export function narratorProse(raw: string): string {
  const start = raw.indexOf(proseOpen);
  if (start !== -1) {
    const content = raw.slice(start + proseOpen.length);
    const end = content.indexOf(proseClose);
    return (end === -1 ? content : content.slice(0, end)).trim();
  }
  if (raw.includes('<resolution>')) return raw.replace(resolutionBlock, '').trim();
  return raw;
}
