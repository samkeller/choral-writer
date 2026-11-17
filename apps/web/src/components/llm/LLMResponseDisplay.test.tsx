// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';

import { LLMResponseDisplay } from './LLMResponseDisplay';

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

describe('LLMResponseDisplay', () => {
  it('renders generic JSON as a collapsible tree and provides formatted JSON', () => {
    render(
      <MantineProvider env="test" forceColorScheme="dark">
        <LLMResponseDisplay response={'{"enabled":true,"count":3,"text":"First line\\nSecond line"}'} />
      </MantineProvider>,
    );

    expect(screen.getByText('enabled')).toBeTruthy();
    expect(screen.getByText('true')).toBeTruthy();
    expect(screen.getByText('First line Second line').textContent).toBe('First line\nSecond line');
    fireEvent.click(screen.getByRole('radio', { name: 'JSON' }));
    expect(screen.getByText(/"enabled": true/)).toBeTruthy();
  });

  it('renders narrator prose for reading and preserves the exact source', () => {
    const response = '<resolution>La porte résiste.</resolution>\n<prose>## Arrivée\n\n**Bonjour.**</prose>';
    render(
      <MantineProvider env="test" forceColorScheme="dark">
        <LLMResponseDisplay response={response} />
      </MantineProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Arrivée' })).toBeTruthy();
    expect(screen.getByText('Bonjour.').tagName).toBe('STRONG');
    expect(screen.getByText('Résolution').closest('details')?.open).toBe(false);
    fireEvent.click(screen.getByRole('radio', { name: 'Source' }));
    expect(screen.getByText((_, element) => element?.tagName === 'PRE' && element.textContent === response)).toBeTruthy();
  });

  it('keeps malformed tags and plain text available without discarding content', () => {
    render(
      <MantineProvider env="test" forceColorScheme="dark">
        <LLMResponseDisplay response={'<prose>Bonjour sans fermeture.'} />
      </MantineProvider>,
    );
    expect(screen.getByText('<prose>Bonjour sans fermeture.')).toBeTruthy();
  });
});
