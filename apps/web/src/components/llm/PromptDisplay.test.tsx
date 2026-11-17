// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';

import { PromptDisplay } from './PromptDisplay';

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

describe('PromptDisplay', () => {
  it('renders prompt Markdown with semantic headings and formatting', () => {
    render(
      <MantineProvider env="test" forceColorScheme="dark">
        <PromptDisplay content={'## Rôle\n\nUtilise **des faits** et `JSON`.\n\nUse <resolution> and <prose> tags.'} />
      </MantineProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Rôle' })).toBeTruthy();
    expect(screen.getByText('des faits').tagName).toBe('STRONG');
    expect(screen.getByText('JSON').tagName).toBe('CODE');
    expect(screen.getByText('Use <resolution> and <prose> tags.')).toBeTruthy();
  });

  it('keeps collapsed previews as clampable text instead of rendering a Code block', () => {
    const prompt = '## Rôle\n\nUne instruction importante.';
    render(
      <MantineProvider env="test" forceColorScheme="dark">
        <PromptDisplay content={prompt} compact lineClamp={2} />
      </MantineProvider>,
    );

    const preview = screen.getByText((_, element) => element?.textContent === prompt);
    expect(preview.getAttribute('data-line-clamp')).toBe('true');
    expect(preview.style.getPropertyValue('--text-line-clamp')).toBe('2');
    expect(screen.queryByRole('heading', { name: 'Rôle' })).toBeNull();
  });
});
