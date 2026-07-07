export default function SkeletonChatRow() {
  return (
    <div className="flex items-center gap-4 px-4 py-3.5 border-b border-wa-border/5">
      <div className="w-[50px] h-[50px] rounded-full bg-wa-secondary/40 skeleton-shimmer" />
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="h-3.5 w-28 rounded bg-wa-secondary/40 skeleton-shimmer" />
          <div className="h-2.5 w-10 rounded bg-wa-secondary/40 skeleton-shimmer" />
        </div>
        <div className="h-3 w-44 rounded bg-wa-secondary/30 skeleton-shimmer" />
      </div>
    </div>
  );
}
