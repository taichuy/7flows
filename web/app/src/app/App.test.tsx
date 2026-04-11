import { render, screen } from '@testing-library/react';
import { beforeEach, vi } from 'vitest';

vi.mock('@1flowse/api-client', () => ({
  fetchApiHealth: vi.fn().mockResolvedValue({
    service: 'api-server',
    status: 'ok',
    version: '0.1.0'
  })
}));

import { App } from './App';

beforeEach(() => {
  window.history.pushState({}, '', '/');
});

test('renders the bootstrap shell and health state', async () => {
  render(<App />);

  expect(await screen.findByText('1Flowse Bootstrap')).toBeInTheDocument();
  expect(
    await screen.findByRole('link', { name: 'agentFlow' })
  ).toBeInTheDocument();
  expect(await screen.findByText(/api-server/i)).toBeInTheDocument();
});

test('renders the embedded apps placeholder route', async () => {
  window.history.pushState({}, '', '/embedded-apps');

  render(<App />);

  expect(await screen.findByText('Embedded Apps')).toBeInTheDocument();
});

test('renders the embedded app detail placeholder route', async () => {
  window.history.pushState({}, '', '/embedded-apps/demo-app');

  render(<App />);

  expect(await screen.findByText('Embedded App Detail')).toBeInTheDocument();
});

test('renders the embedded mount placeholder route', async () => {
  window.history.pushState({}, '', '/embedded/demo-app');

  render(<App />);

  expect(await screen.findByText('Embedded App Mount')).toBeInTheDocument();
});
