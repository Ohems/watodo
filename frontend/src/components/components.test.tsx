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
