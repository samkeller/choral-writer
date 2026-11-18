// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReceivedMemory } from './TraceDrawer';

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('distinguishes an empty received context from an unavailable historical context', () => {
  const view = render(<MantineProvider env="test" forceColorScheme="dark"><ReceivedMemory memory={{ tags: [], entries: [] }} /></MantineProvider>);
  fireEvent.click(screen.getByText('Mémoire reçue · 0 entrée(s)'));
  expect(screen.getByText('Aucune entrée mémoire reçue.')).toBeTruthy();
  view.rerender(<MantineProvider env="test" forceColorScheme="dark"><ReceivedMemory memory={undefined} /></MantineProvider>);
  expect(screen.getByText('Détail mémoire indisponible pour cet ancien appel.')).toBeTruthy();
  expect(screen.queryByText('Aucune entrée mémoire reçue.')).toBeNull();
});
