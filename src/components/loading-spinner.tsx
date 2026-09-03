export function LoadingSpinner({ className = "" }: { className?: string }) {
  return (
    <div role="status" aria-label="読み込み中" className={`flex items-center justify-center ${className}`}>
      <span className="sr-only">読み込み中</span>
      <span aria-hidden="true" className="h-10 w-10 animate-spin rounded-full border-4 border-teal-100 border-t-teal-700 motion-reduce:animate-none" />
    </div>
  );
}
