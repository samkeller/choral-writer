// PROTOTYPE — lancement d'une variante : « rejouer ce tour avec… ». Ne fait aucun appel.
import { Button, Checkbox, Group, Modal, Select, Stack, Text, Textarea } from '@mantine/core';

export function ReplayModal({ opened, onClose, onLaunch }: { opened: boolean; onClose: () => void; onLaunch: () => void }) {
  return (
    <Modal opened={opened} onClose={onClose} title="Rejouer ce tour avec une autre configuration" size="lg">
      <Stack gap="sm">
        <Text size="xs" c="dimmed">
          Même saisie, même mémoire qu’avant le tour. Le résultat devient une nouvelle branche ; la configuration
          du projet n’est pas modifiée.
        </Text>
        <Text size="sm" fw={600}>Agents d’analyse</Text>
        {[['Marchand', 'v2'], ['Cohérence', 'v1'], ['Hors champ', 'v1'], ['Agent du chaos', 'v1']].map(([name, version]) => (
          <Group key={name} justify="space-between">
            <Checkbox label={name} defaultChecked />
            <Select size="xs" w={110} data={['v1', 'v2', 'v3']} defaultValue={version} />
          </Group>
        ))}
        <Group justify="space-between">
          <Text size="sm" fw={600}>Narrateur</Text>
          <Select size="xs" w={110} data={['v3', 'v4 (brouillon)']} defaultValue="v4 (brouillon)" />
        </Group>
        <Textarea label="Ajustement ponctuel des instructions (facultatif)" autosize minRows={2}
          placeholder="Ex. : ne pas finir sur une question au joueur" />
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose}>Annuler</Button>
          <Button onClick={() => { onLaunch(); onClose(); }}>Rejouer et comparer</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
