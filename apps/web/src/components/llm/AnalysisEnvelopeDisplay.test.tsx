// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import type { AnalysisEnvelope } from '@choral-writer/shared';

import { AnalysisEnvelopeDisplay } from './AnalysisEnvelopeDisplay';

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AnalysisEnvelopeDisplay', () => {
  it('orders items by decreasing importance, retaining ties and the original envelope order', () => {
    const items = [
      { kind: 'observation', text: 'Secondary detail.', importance: 'LOW' },
      { kind: 'observation', text: 'Useful detail.', importance: 'NORMAL' },
      { kind: 'constraint', text: 'Decisive constraint.', importance: 'HIGH' },
      { kind: 'risk', text: 'Decisive risk.', importance: 'HIGH' },
    ] satisfies AnalysisEnvelope['items'];
    render(
      <MantineProvider env="test" forceColorScheme="dark">
        <AnalysisEnvelopeDisplay envelope={{ v: 1, agent: 'Chaos', summary: 'Summary.', items }} />
      </MantineProvider>,
    );

    const itemTexts = screen.getAllByText(/^(Secondary detail|Useful detail|Decisive constraint|Decisive risk)\.$/);
    expect(itemTexts.map((element) => element.textContent)).toEqual([
      'Decisive constraint.', 'Decisive risk.', 'Useful detail.', 'Secondary detail.',
    ]);
    expect(items.map((item) => item.text)).toEqual([
      'Secondary detail.', 'Useful detail.', 'Decisive constraint.', 'Decisive risk.',
    ]);
  });

  it('shows all items initially and filters by free-form kind without losing the summary', () => {
    render(
      <MantineProvider env="test" forceColorScheme="dark">
        <AnalysisEnvelopeDisplay envelope={{
          v: 1, agent: 'Chaos', summary: 'Une clé manque.',
          items: [
            { kind: 'recommendation', text: 'Chercher la clé.', importance: 'HIGH' },
            { kind: 'custom-kind', text: 'Le couloir est sombre.', importance: 'NORMAL' },
          ],
        }} />
      </MantineProvider>,
    );

    expect(screen.getByText('Chercher la clé.')).toBeTruthy();
    expect(screen.getByText('Le couloir est sombre.')).toBeTruthy();
    fireEvent.click(screen.getByRole('textbox', { name: 'Filtrer les éléments de Chaos' }));
    fireEvent.click(screen.getByRole('option', { name: 'custom-kind (1)' }));
    expect(screen.queryByText('Chercher la clé.')).toBeNull();
    expect(screen.getByText('Le couloir est sombre.')).toBeTruthy();
    expect(screen.getByText('Une clé manque.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Afficher tous les éléments de Chaos' }));
    expect(screen.getByText('Chercher la clé.')).toBeTruthy();
  });
});
