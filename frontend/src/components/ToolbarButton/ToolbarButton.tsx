import Button from '@mui/material/Button';
import type { ReactNode } from 'react';

interface ToolbarButtonProps {
  children: ReactNode;
  onClick?: () => void;
  expand?: boolean;
  selected?: boolean;
}

function ToolbarButton({ children, onClick, expand, selected }: ToolbarButtonProps) {
  return (
    <Button
      variant={selected ? 'contained' : 'text'}
      onClick={onClick}
      sx={{ minWidth: expand ? 'auto' : 40 }}
    >
      {children}
    </Button>
  );
}

export default ToolbarButton;
