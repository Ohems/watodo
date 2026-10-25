import { Card, Text } from '@mantine/core';
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
      withBorder
      shadow={onClick ? 'sm' : undefined}
      style={{
        width: 200,
        height: 80,
        cursor: onClick ? 'pointer' : 'default',
        margin: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text ta="center">{children}</Text>
    </Card>
  );
}

export default UserCard;
