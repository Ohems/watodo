import { Button } from '@mantine/core';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

interface NavigationButtonProps {
  children: ReactNode;
  route?: string;
  href?: string;
  secondary?: boolean;
  selected?: boolean;
}

function NavigationButton({ children, route, href, secondary, selected }: NavigationButtonProps) {
  const navigate = useNavigate();

  const handleClick = () => {
    if (route) navigate(route);
    else if (href) window.open(href, '_blank')?.focus();
  };

  return (
    <Button variant={selected ? 'filled' : secondary ? 'default' : 'subtle'} onClick={handleClick}>
      {children}
    </Button>
  );
}

export default NavigationButton;
