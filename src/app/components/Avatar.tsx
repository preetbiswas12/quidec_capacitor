interface AvatarProps {
  src?: string | null;
  name: string;
  color: string;
  size?: number;
  isOnline?: boolean;
  className?: string;
}

export default function Avatar({ src, name, color, size = 40, isOnline, className = '' }: AvatarProps) {
  const initials = name
    .split(' ')
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className={`relative flex-shrink-0 ${className}`} style={{ width: size, height: size }}>
      {src ? (
        <img
          src={src}
          alt={name}
          className="w-full h-full rounded-full object-cover ring-1 ring-wa-border/10"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      ) : (
        <div
          className="w-full h-full rounded-full flex items-center justify-center text-white select-none"
          style={{
            backgroundColor: color,
            fontSize: size * 0.34,
            fontWeight: 600,
            letterSpacing: '0.5px',
          }}
        >
          {initials}
        </div>
      )}
      {isOnline && (
        <span
          className="absolute bottom-0 right-0 rounded-full bg-wa-online border-2 border-wa-main animate-[pulse_3s_ease-in-out_infinite] transition-colors"
          style={{ width: size * 0.26, height: size * 0.26 }}
        />
      )}
    </div>
  );
}
