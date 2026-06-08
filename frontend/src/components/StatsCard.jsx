import './StatsCard.css';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export default function StatsCard({ title, value, subtitle, trend, trendValue, icon: Icon, color = 'primary' }) {
  const trendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const TrendIcon = trendIcon;

  return (
    <div className={`stats-card stats-card--${color}`}>
      <div className="stats-card__header">
        <span className="stats-card__title">{title}</span>
        {Icon && (
          <div className="stats-card__icon-wrap">
            <Icon size={20} />
          </div>
        )}
      </div>
      <div className="stats-card__value">{value}</div>
      <div className="stats-card__footer">
        {subtitle && <span className="stats-card__subtitle">{subtitle}</span>}
        {trendValue && (
          <span className={`stats-card__trend stats-card__trend--${trend || 'neutral'}`}>
            <TrendIcon size={14} />
            {trendValue}
          </span>
        )}
      </div>
    </div>
  );
}
