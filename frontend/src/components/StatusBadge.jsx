import './StatusBadge.css';

const STATUS_MAP = {
  draft: { label: 'Черновик', variant: 'gray' },
  active: { label: 'Активный', variant: 'red' },
  completed: { label: 'Завершён', variant: 'green' },
  archived: { label: 'Архив', variant: 'gray-outline' },
  new: { label: 'Новый', variant: 'red' },
};

export default function StatusBadge({ status, label: customLabel, size = 'md' }) {
  const config = STATUS_MAP[status] || { label: status, variant: 'gray' };
  const displayLabel = customLabel || config.label;

  return (
    <span className={`status-badge status-badge--${config.variant} status-badge--${size}`}>
      {displayLabel}
    </span>
  );
}
