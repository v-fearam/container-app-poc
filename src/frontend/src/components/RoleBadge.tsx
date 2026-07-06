interface RoleBadgeProps {
  role: string;
}

export function RoleBadge({ role }: RoleBadgeProps) {
  const colorClass =
    role === 'Weather.Admin'
      ? 'bg-purple-100 text-purple-700'
      : role === 'Weather.User'
        ? 'bg-blue-100 text-blue-700'
        : 'bg-gray-100 text-gray-600';

  return (
    <span className={`text-xs font-semibold px-2 py-1 rounded-md inline-block ${colorClass}`}>
      {role}
    </span>
  );
}
