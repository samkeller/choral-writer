import { Text } from '@mantine/core';
import { IconFeather } from '@tabler/icons-react';

export function Brand() {
  return (
    <div className="brand">
      <div className="brand-mark"><IconFeather size={20} stroke={1.8} /></div>
      <div>
        <Text fw={700} size="sm" lh={1.2}>Choral Writer</Text>
        <Text size="xs" c="dimmed">Histoires en devenir</Text>
      </div>
    </div>
  );
}
