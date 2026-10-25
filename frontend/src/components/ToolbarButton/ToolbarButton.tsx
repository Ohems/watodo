import { Button } from '@mantine/core';
import type { ReactNode } from 'react';

interface ToolbarButtonProps {
  children: ReactNode;
  onClick?: () => void;
  expand?: boolean;
  selected?: boolean;
}

function ToolbarButton({ children, onClick, expand, selected }: ToolbarButtonProps) {
  return (
    <Button variant={selected ? 'filled' : 'subtle'} onClick={onClick} px={expand ? 'md' : 'xs'}>
      {children}
    </Button>
  );
}

export default ToolbarButton;
