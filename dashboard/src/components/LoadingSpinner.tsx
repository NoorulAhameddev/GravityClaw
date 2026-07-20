export function LoadingSpinner({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-muted" role="status" aria-label={label}>
      <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" aria-hidden="true" />
      <div className="text-sm">{label}</div>
    </div>
  );
}
