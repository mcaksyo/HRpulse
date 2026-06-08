import './Input.css';

export default function Input({
  label,
  error,
  icon: Icon,
  type = 'text',
  className = '',
  fullWidth = false,
  ...props
}) {
  return (
    <div className={`input-wrapper ${fullWidth ? 'input-wrapper--full' : ''} ${className}`}>
      {label && <label className="input-label">{label}</label>}
      <div className={`input-container ${error ? 'input-container--error' : ''}`}>
        {Icon && <Icon size={18} className="input-icon" />}
        {type === 'textarea' ? (
          <textarea className="input-field input-field--textarea" {...props} />
        ) : (
          <input type={type} className="input-field" {...props} />
        )}
      </div>
      {error && <span className="input-error">{error}</span>}
    </div>
  );
}
