import { Alert, Button, Group, Stack, Textarea, TextInput } from '@mantine/core';
import type { ProjectInput } from '@choral-writer/shared';
import { useProjectForm } from '../../hooks/useProjectForm';

interface ProjectFormProps {
  initial?: ProjectInput;
  onSubmit: (input: ProjectInput) => Promise<void>;
  onCancel: () => void;
}

export function ProjectForm({ initial, onSubmit, onCancel }: ProjectFormProps) {
  const form = useProjectForm(initial, onSubmit);
  return (
    <form onSubmit={form.submit}>
      <Stack>
        <ProjectFormFields form={form} />
        <Group justify="flex-end">
          <Button variant="default" onClick={onCancel} disabled={form.pending}>Annuler</Button>
          <Button type="submit" loading={form.pending}>Enregistrer</Button>
        </Group>
      </Stack>
    </form>
  );
}

export function ProjectFormFields({ form }: { form: ReturnType<typeof useProjectForm> }) {
  return <Stack>
    <TextInput
      label="Nom du projet" required maxLength={120} value={form.name}
      onChange={(event) => form.setName(event.currentTarget.value)} disabled={form.pending} autoFocus
    />
    <Textarea
      label="Prompt système"
      description="Définissez le monde, le rôle et le ton du chatbot. Ce prompt accompagne chaque message."
      value={form.systemPrompt} onChange={(event) => form.setSystemPrompt(event.currentTarget.value)}
      minRows={8} autosize maxRows={18} maxLength={50_000} disabled={form.pending}
    />
    {form.error && <Alert color="red" role="alert">{form.error}</Alert>}
  </Stack>;
}
