import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import EditField from './EditField/EditField.js';
import NavigationButton from './NavigationButton/NavigationButton.js';
import ToolbarButton from './ToolbarButton/ToolbarButton.js';
import UserCard from './UserCard/UserCard.js';

describe('EditField', () => {
  it('displays value when not editing', () => {
    render(<EditField value="Test Value" editing={false} />);
    expect(screen.getByText('Test Value')).toBeInTheDocument();
  });

  it('displays placeholder when value is empty', () => {
    render(<EditField value="" editing={false} />);
    expect(screen.getByText('Not set')).toBeInTheDocument();
  });

  it('shows input when editing', () => {
    render(<EditField value="Test" editing={true} label="Name" />);
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
  });

  it('does not render a visible label (the page renders it above the field)', () => {
    render(<EditField value="Test" editing={true} label="Name" />);
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.queryByText('Name')).not.toBeInTheDocument();
  });

  it('shows the validation error below the input and marks it invalid', () => {
    render(<EditField value="" editing={true} label="Phone number" error="Invalid phone number" />);
    expect(screen.getByText('Invalid phone number')).toBeInTheDocument();
    expect(screen.getByLabelText('Phone number')).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('UserCard', () => {
  it('renders children', () => {
    render(<UserCard>Test Content</UserCard>);
    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });
});

describe('ToolbarButton', () => {
  it('renders children', () => {
    render(<ToolbarButton>Click Me</ToolbarButton>);
    expect(screen.getByText('Click Me')).toBeInTheDocument();
  });
});

describe('NavigationButton', () => {
  it('renders children', () => {
    render(
      <BrowserRouter>
        <NavigationButton route="/test">Go</NavigationButton>
      </BrowserRouter>,
    );
    expect(screen.getByText('Go')).toBeInTheDocument();
  });
});
