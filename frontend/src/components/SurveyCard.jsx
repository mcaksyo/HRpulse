import './SurveyCard.css';
import { Clock, Users, Calendar } from 'lucide-react';
import StatusBadge from './StatusBadge';
import ProgressBar from './ProgressBar';
import Button from './Button';

export default function SurveyCard({
  survey,
  onAction,
  actionLabel = 'Пройти',
  showProgress = true,
  variant = 'employee',
}) {
  const {
    id,
    title,
    description,
    status = 'active',
    deadline,
    estimatedTime,
    completionRate,
    isNew,
    responsesCount,
    totalTarget,
  } = survey;

  return (
    <div className="survey-card animate-fade-in-up">
      <div className="survey-card__header">
        <div className="survey-card__title-row">
          <h3 className="survey-card__title">{title}</h3>
          {isNew && <StatusBadge status="new" label="Новый" size="sm" />}
          {!isNew && <StatusBadge status={status} size="sm" />}
        </div>
        {description && <p className="survey-card__desc">{description}</p>}
      </div>

      <div className="survey-card__meta">
        {deadline && (
          <span className="survey-card__meta-item">
            <Calendar size={14} />
            до {deadline}
          </span>
        )}
        {estimatedTime && (
          <span className="survey-card__meta-item">
            <Clock size={14} />
            ~{estimatedTime} мин
          </span>
        )}
        {variant === 'hr' && responsesCount !== undefined && (
          <span className="survey-card__meta-item">
            <Users size={14} />
            {responsesCount}/{totalTarget} ответов
          </span>
        )}
      </div>

      {showProgress && completionRate !== undefined && (
        <div className="survey-card__progress">
          <ProgressBar value={completionRate} size="sm" showPercent={false} />
          <span className="survey-card__progress-label">
            Уже прошли {completionRate}% сотрудников
          </span>
        </div>
      )}

      <div className="survey-card__actions">
        <Button
          variant={status === 'completed' ? 'ghost' : 'primary'}
          size="sm"
          onClick={() => onAction?.(id)}
        >
          {actionLabel}
        </Button>
      </div>
    </div>
  );
}
