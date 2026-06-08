import './CircularProgress.css';

export default function CircularProgress({
  value = 0,
  max = 100,
  size = 120,
  strokeWidth = 8,
  label,
  showValue = true,
}) {
  const percent = Math.min(Math.round((value / max) * 100), 100);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <div className="circular-progress" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="circular-progress__svg">
        <circle
          className="circular-progress__bg"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
        />
        <circle
          className="circular-progress__fill"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="circular-progress__content">
        {showValue && <span className="circular-progress__value">{percent}%</span>}
        {label && <span className="circular-progress__label">{label}</span>}
      </div>
    </div>
  );
}
