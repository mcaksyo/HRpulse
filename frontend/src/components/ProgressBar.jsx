import './ProgressBar.css';

export default function ProgressBar({ value = 0, max = 100, label, showPercent = true, size = 'md' }) {
  const percent = Math.min(Math.round((value / max) * 100), 100);

  return (
    <div className={`progress-bar progress-bar--${size}`}>
      {label && <div className="progress-bar__label">{label}</div>}
      <div className="progress-bar__track">
        <div
          className="progress-bar__fill"
          style={{ width: `${percent}%` }}
        />
      </div>
      {showPercent && <span className="progress-bar__percent">{percent}%</span>}
    </div>
  );
}
