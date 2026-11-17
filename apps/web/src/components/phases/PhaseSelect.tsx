import { Combobox, InputBase, useCombobox } from '@mantine/core';
import { agentPhaseSchema, type AgentPhase } from '@choral-writer/shared';

import { PhaseTag } from './PhaseTag';

export type PhaseFilter = AgentPhase | 'all';

export function PhaseSelect({ value, onChange }: {
  value: PhaseFilter;
  onChange: (value: PhaseFilter) => void;
}) {
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
    onDropdownOpen: () => combobox.updateSelectedOptionIndex('active'),
  });

  return (
    <Combobox store={combobox} onOptionSubmit={(option) => {
      onChange(option === 'all' ? 'all' : agentPhaseSchema.parse(option));
      combobox.closeDropdown();
    }}>
      <Combobox.Target targetType="button">
        <InputBase component="button" type="button" pointer aria-label="Filtrer par phase"
          w={{ base: '100%', sm: 220 }} rightSection={<Combobox.Chevron />}
          rightSectionPointerEvents="none" onClick={() => combobox.toggleDropdown()}>
          {value === 'all' ? 'Toutes les phases' : <PhaseTag phase={value} />}
        </InputBase>
      </Combobox.Target>
      <Combobox.Dropdown>
        <Combobox.Options aria-label="Phases">
          <Combobox.Option value="all" active={value === 'all'}>Toutes les phases</Combobox.Option>
          {agentPhaseSchema.options.map((phase) => (
            <Combobox.Option key={phase} value={phase} active={value === phase}>
              <PhaseTag phase={phase} />
            </Combobox.Option>
          ))}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}
