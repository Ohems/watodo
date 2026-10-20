import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import type { ReactNode } from 'react';

interface UserCardProps {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}

function UserCard({ children, onClick, className }: UserCardProps) {
  return (
    <Card
      className={className}
      onClick={onClick}
      sx={{
        width: 200,
        height: 80,
        cursor: onClick ? 'pointer' : 'default',
        m: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'box-shadow 0.2s',
        '&:hover': onClick ? { boxShadow: 4 } : {},
      }}
    >
      <CardContent sx={{ textAlign: 'center' }}>{children}</CardContent>
    </Card>
  );
}

export default UserCard;
