import { Button, Menu, Text } from '@mantine/core';
import { IconCheck, IconChevronDown, IconGitBranch } from '@tabler/icons-react';
import type { ChatBranch } from '@choral-writer/shared';

/**
 * Sélection de la branche de conversation. Un menu compact remplace le champ à
 * libellé flottant : la branche courante reste lisible dans l'en-tête et le
 * changement tient en deux gestes, sans décaler le contenu de la page.
 */
export function BranchSwitcher({ branches, currentId, disabled, onChange }: {
  branches: readonly ChatBranch[];
  currentId: string | null;
  disabled?: boolean;
  onChange: (branchId: string) => void;
}) {
  const current = branches.find((branch) => branch.id === currentId);
  return <Menu position="bottom-end" withinPortal shadow="md" width={240}>
    <Menu.Target>
      <Button variant="subtle" color="gray" size="compact-md" disabled={disabled}
        aria-label="Branche de conversation"
        leftSection={<IconGitBranch size={16} aria-hidden="true" />}
        rightSection={<IconChevronDown size={14} aria-hidden="true" />}>
        <Text size="sm" truncate maw="10rem">{current?.name ?? 'Branche'}</Text>
      </Button>
    </Menu.Target>
    <Menu.Dropdown>
      <Menu.Label>Branches de conversation</Menu.Label>
      {branches.map((branch) => <Menu.Item key={branch.id} onClick={() => onChange(branch.id)}
        leftSection={branch.id === currentId
          ? <IconCheck size={16} aria-hidden="true" />
          : <IconGitBranch size={16} aria-hidden="true" />}
        aria-current={branch.id === currentId ? 'true' : undefined}>
        {branch.name}
      </Menu.Item>)}
      {branches.length <= 1 && <Menu.Item disabled>Aucune autre branche.</Menu.Item>}
    </Menu.Dropdown>
  </Menu>;
}