export function Progress({ step, total }: { step: number; total: number }): JSX.Element {
  const pct = Math.round((step / total) * 100);
  return (
    <div className="progress">
      <div className="progress-inner">
        <span>Schritt {step} von {total}</span>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <span>{pct}%</span>
      </div>
    </div>
  );
}
