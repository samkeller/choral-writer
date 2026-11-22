// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import type { TurnDevelopments } from '@choral-writer/shared';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { TurnDevelopmentsPanel } from './TurnDevelopmentsPanel';

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function renderPanel(developments: TurnDevelopments | null) {
  return render(
    <MantineProvider env="test" forceColorScheme="dark"><TurnDevelopmentsPanel developments={developments} /></MantineProvider>,
  );
}

it('separates the developments told in the scene from the off-screen ones', () => {
  renderPanel({
    scene: [{ agent: 'Monde', item: {
      kind: 'development', characters: ['Personnage A'], scope: 'scene', text: 'Une lampe s’éteint.', importance: 'HIGH',
    } }],
    offscreen: [],
  });

  const scene = within(screen.getByRole('region', { name: 'Dans la scène' }));
  expect(scene.getByText('Une lampe s’éteint.')).toBeTruthy();
  expect(scene.getByText('Monde')).toBeTruthy();
  expect(scene.getByText('Personnage A')).toBeTruthy();
  expect(within(screen.getByRole('region', { name: 'Hors champ' }))
    .getByText('Aucun développement hors champ à ce tour.')).toBeTruthy();
});

it('says when a turn predates the recording of developments', () => {
  renderPanel(null);
  expect(screen.getByText('Développements non enregistrés : ce tour précède leur enregistrement.')).toBeTruthy();
});
