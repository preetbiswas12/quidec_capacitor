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
          className="w-full h-full rounded-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      ) : (
        <div
          className="w-full h-full rounded-full flex items-center justify-center text-white select-none"
          style={{
            backgroundColor: color,
            fontSize: size * 0.35,
            fontWeight: 600,
          }}
        >
          {initials}
        </div>
      )}
      {isOnline && (
        <span
          className="absolute bottom-0 right-0 rounded-full bg-[#00A884] border-2 border-[#111B21]"
          style={{ width: size * 0.28, height: size * 0.28 }}
        />
      )}
    </div>
  );
}
