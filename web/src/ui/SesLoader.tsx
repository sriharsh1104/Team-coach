export function SesLoader({ label }: { label: string }) {
  return (
    <div className="ses-loader" role="status" aria-live="polite" aria-label={label}>
      <img src="/sacred-logo-transparent.png" alt="" />
    </div>
  );
}
