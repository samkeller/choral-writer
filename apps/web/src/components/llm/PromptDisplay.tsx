import { Box, Group, Text } from '@mantine/core';
import { IconTerminal2 } from '@tabler/icons-react';

import { MarkdownContent } from './MarkdownContent';
import styles from './PromptDisplay.module.css';

interface PromptDisplayProps {
  content: string;
  compact?: boolean;
  lineClamp?: number;
}

export function PromptDisplay({ content, compact = false, lineClamp = 3 }: PromptDisplayProps) {
  return (
    <Box component="section" aria-label="Prompt" className={styles.prompt}>
      <Text size="xs" fw={600}>Prompt</Text>
      {compact ? (
        <Text size="sm" c="dimmed" lineClamp={lineClamp} className={styles.preview}>
          {content}
        </Text>
      ) : <MarkdownContent content={content} />}
    </Box>
  );
}
