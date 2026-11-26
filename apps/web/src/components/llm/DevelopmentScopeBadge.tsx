import { Badge } from '@mantine/core';
import { isDevelopment, type AnalysisItem } from '@choral-writer/shared';

/** The scope and characters of a development; nothing for a perspective, including one recorded before scopes existed. */
export function DevelopmentScopeBadge({ item }: { item: AnalysisItem }) {
  if (!isDevelopment(item)) return null;
  return (
    <Badge size="xs" variant="outline" color="gray" tt="none">
      {item.scope === 'scene' ? 'Dans la scène' : 'Hors champ'}
      {item.characters.length > 0 && ` · ${item.characters.join(', ')}`}
    </Badge>
  );
}
