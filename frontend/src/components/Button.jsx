import './Button.css';

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  disabled = false,
  loading = false,
  icon: Icon,
  iconRight: IconRight,
  type = 'button',
  onClick,
  className = '',
  ...props
}) {
  const classes = [
    'btn',
    `btn--${variant}`,
    `btn--${size}`,
    fullWidth && 'btn--full',
    disabled && 'btn--disabled',
    loading && 'btn--loading',
    className,
  ].filter(Boolean).join(' ');

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      onClick={onClick}
      {...props}
    >
      {loading && <span className="btn__spinner" />}
      {!loading && Icon && <Icon size={size === 'sm' ? 16 : 18} className="btn__icon" />}
      {children && <span className="btn__text">{children}</span>}
      {!loading && IconRight && <IconRight size={size === 'sm' ? 16 : 18} className="btn__icon-right" />}
    </button>
  );
}
