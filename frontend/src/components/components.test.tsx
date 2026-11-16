import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import EditField from './EditField/EditField.js';
import NavigationButton from './NavigationButton/NavigationButton.js';
import { QueryState } from './QueryState/index.js';
import ToolbarButton from './ToolbarButton/ToolbarButton.js';
import UserCard from './UserCard/UserCard.js';

function renderWithMantine(ui: React.ReactElement) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

describe('EditField', () => {
  it('displays value when not editing', () => {
    renderWithMantine(<EditField value="Test Value" editing={false} />);
    expect(screen.getByText('Test Value')).toBeInTheDocument();
  });

  it('displays placeholder when value is empty', () => {
    renderWithMantine(<EditField value="" editing={false} />);
    expect(screen.getByText('Not set')).toBeInTheDocument();
  });

  it('shows input when editing', () => {
    renderWithMantine(<EditField value="Test" editing={true} label="Name" />);
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
  });

  it('does not render a visible label (the page renders it above the field)', () => {
    renderWithMantine(<EditField value="Test" editing={true} label="Name" />);
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.queryByText('Name')).not.toBeInTheDocument();
  });

  it('shows the validation error below the input and marks it invalid', () => {
    renderWithMantine(
      <EditField value="" editing={true} label="Phone number" error="Invalid phone number" />,
    );
    expect(screen.getByText('Invalid phone number')).toBeInTheDocument();
    expect(screen.getByLabelText('Phone number')).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('UserCard', () => {
  it('renders children', () => {
    renderWithMantine(<UserCard>Test Content</UserCard>);
    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });
});

describe('ToolbarButton', () => {
  it('renders children', () => {
    renderWithMantine(<ToolbarButton>Click Me</ToolbarButton>);
    expect(screen.getByText('Click Me')).toBeInTheDocument();
  });
});

describe('NavigationButton', () => {
  it('renders children', () => {
    render(
      <MantineProvider>
        <BrowserRouter>
          <NavigationButton route="/test">Go</NavigationButton>
        </BrowserRouter>
      </MantineProvider>,
    );
    expect(screen.getByText('Go')).toBeInTheDocument();
  });
});

describe('QueryState', () => {
  it('shows a loading indicator while the query is pending and no data is loaded yet', () => {
    renderWithMantine(
      <QueryState query={{ isLoading: true, isError: false }}>
        {() => <div>content</div>}
      </QueryState>,
    );
    expect(screen.getByLabelText('Loading...')).toBeInTheDocument();
    expect(screen.queryByText('content')).not.toBeInTheDocument();
  });

  it('shows a clear error message when the query failed, instead of empty data', () => {
    renderWithMantine(
      <QueryState query={{ isLoading: false, isError: true }}>
        {() => <div>content</div>}
      </QueryState>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/could not be loaded/);
    expect(screen.queryByText('content')).not.toBeInTheDocument();
  });

  it('renders the children only with successfully loaded data', () => {
    renderWithMantine(
      <QueryState query={{ isLoading: false, isError: false, data: [1, 2] }}>
        {data => <div>items: {data.length}</div>}
      </QueryState>,
    );
    expect(screen.getByText('items: 2')).toBeInTheDocument();
  });

  it('renders nothing for a skipped query', () => {
    renderWithMantine(
      <QueryState query={{ isLoading: false, isError: false, isUninitialized: true }}>
        {() => <div>content</div>}
      </QueryState>,
    );
    expect(screen.queryByText('content')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Loading...')).not.toBeInTheDocument();
  });
});
