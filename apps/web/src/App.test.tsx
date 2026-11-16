// @vitest-environment jsdom

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';

import { api } from './api/client.js';
import { App } from './App.js';

const originalAdapter = api.defaults.adapter;
const adapter = vi.fn<AxiosAdapter>();

function respond(config: InternalAxiosRequestConfig, status: number, data: unknown) {
  const response = { config, status, data, statusText: String(status), headers: {} };
  if (status >= 400) {
    throw new AxiosError('Request failed', undefined, config, undefined, response);
  }
  return response;
}

function LocationProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output data-testid="location">{location.pathname}</output>
      <button onClick={() => navigate(-1)}>Précédent</button>
    </>
  );
}

function renderApp(path: string) {
  return render(
    <MantineProvider env="test">
      <MemoryRouter initialEntries={[path]}>
        <App />
        <LocationProbe />
      </MemoryRouter>
    </MantineProvider>,
  );
}

beforeAll(() => {
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

beforeEach(() => {
  adapter.mockReset();
  api.defaults.adapter = adapter;
});

afterEach(() => {
  cleanup();
  api.defaults.adapter = originalAdapter;
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('routing and authentication', () => {
  it('redirects an anonymous visitor, handles invalid credentials, and returns to the requested page', async () => {
    adapter.mockImplementation(async (config) => {
      if (config.url === '/login') {
        return respond(config, 401, { error: { code: 'INVALID_CREDENTIALS', message: 'Incorrect password.' } });
      }
      return respond(config, 401, { error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } });
    });
    renderApp('/projects');

    await screen.findByLabelText('Mot de passe');
    expect(screen.getByTestId('location').textContent).toBe('/login');
    fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'wrong-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    await screen.findByText('Incorrect password.');
    expect(screen.getByLabelText('Mot de passe')).toBeTruthy();

    adapter.mockImplementation(async (config) => respond(config, 200, { authenticated: true }));
    fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'correct-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    await screen.findByRole('heading', { name: 'Projets' });
    expect(screen.getByTestId('location').textContent).toBe('/projects');

    adapter.mockImplementation(async (config) => respond(config, 401, {
      error: { code: 'UNAUTHORIZED', message: 'Authentication required.' },
    }));
    await act(async () => {
      await expect(api.get('/restricted')).rejects.toBeInstanceOf(AxiosError);
    });
    await screen.findByLabelText('Mot de passe');
    expect(screen.getByTestId('location').textContent).toBe('/login');
  });

  it('keeps server failures distinct from anonymous sessions and allows retrying', async () => {
    adapter.mockImplementation(async (config) => respond(config, 500, ''));
    renderApp('/agents');

    await screen.findByText('Connexion au serveur impossible');
    expect(screen.getByTestId('location').textContent).toBe('/agents');
    expect(screen.queryByLabelText('Mot de passe')).toBeNull();

    adapter.mockImplementation(async (config) => respond(config, 200, { authenticated: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    await screen.findByRole('heading', { name: 'Agents' });
    expect(screen.getByTestId('location').textContent).toBe('/agents');
  });

  it('supports direct URLs and browser history, and displays logout errors', async () => {
    adapter.mockImplementation(async (config) => respond(config, 200, { authenticated: true }));
    renderApp('/traces');

    await screen.findByRole('heading', { name: 'Traces' });
    fireEvent.click(screen.getAllByRole('link', { name: 'Mémoires' })[0]);
    await screen.findByRole('heading', { name: 'Mémoires' });
    expect(screen.getByTestId('location').textContent).toBe('/memories');
    fireEvent.click(screen.getByRole('button', { name: 'Précédent' }));
    await screen.findByRole('heading', { name: 'Traces' });
    expect(screen.getByTestId('location').textContent).toBe('/traces');

    adapter.mockImplementation(async (config) => respond(config, 500, {
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Logout unavailable.' },
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Se déconnecter' }));
    await screen.findByText('Logout unavailable.');
    expect(screen.getByTestId('location').textContent).toBe('/traces');

    adapter.mockImplementation(async (config) => respond(config, 200, { authenticated: false }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Se déconnecter' }).hasAttribute('disabled')).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Se déconnecter' }));
    await screen.findByLabelText('Mot de passe');
    expect(screen.getByTestId('location').textContent).toBe('/login');
  });
});
