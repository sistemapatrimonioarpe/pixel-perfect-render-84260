export function BrandMark({ size = 40 }: { size?: number }) {
  return <img src="/favicon.svg" width={size} height={size} alt="CTI · ARPE" className="shrink-0" />;
}

export function TricolorStripe({ className = "" }: { className?: string }) {
  return (
    <div className={`flex h-1 overflow-hidden rounded-full ${className}`} aria-hidden>
      <span className="flex-1 bg-brand-red" /><span className="flex-1 bg-brand-yellow" /><span className="flex-1 bg-brand-green" />
    </div>
  );
}
