import type { AttributionVerdict } from '@choral-writer/shared';

export const verdictPresentation = {
  retenu: { label: 'retenu dans la prose', color: 'green' },
  partiel: { label: 'partiel dans la prose', color: 'yellow' },
  absent: { label: 'absent de la prose', color: 'gray' },
} satisfies Record<AttributionVerdict, { label: string; color: string }>;
