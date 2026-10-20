import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import NoOrganizationPage from './NoOrganizationPage/NoOrganizationPage.js';

describe('ErrorPage', () => {
  it('renders error message', async () => {
    const router = createMemoryRouter(
      [{ path: '*', element: <ErrorPageComponent />, errorElement: <ErrorPageComponent /> }],
      { initialEntries: ['/'] },
    );
    render(<RouterProvider router={router} />);
    expect(await screen.findByText('Oops!')).toBeInTheDocument();
  });
});

import ErrorPageComponent from './ErrorPage/ErrorPage.js';

describe('NoOrganizationPage', () => {
  it('renders no organization message', () => {
    const router = createMemoryRouter([{ path: '*', element: <NoOrganizationPage /> }], {
      initialEntries: ['/'],
    });
    render(<RouterProvider router={router} />);
    expect(screen.getByText('No Organization')).toBeInTheDocument();
    expect(screen.getByText(/not a member of any organization/i)).toBeInTheDocument();
  });
});
