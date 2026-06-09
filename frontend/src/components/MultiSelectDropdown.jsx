import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

function buildSelectionLabel(options, selectedValues, placeholder) {
  if (!selectedValues.length) {
    return placeholder;
  }

  if (options.length && selectedValues.length === options.length) {
    return 'Выбраны все';
  }

  const labelsByValue = new Map(options.map((option) => [option.value, option.label]));
  return selectedValues.map((value) => labelsByValue.get(value) || value).join(', ');
}

export default function MultiSelectDropdown({
  label,
  options,
  selectedValues,
  onChange,
  placeholder,
  disabled = false,
}) {
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);

  const normalizedSelectedValues = useMemo(
    () => [...new Set(Array.isArray(selectedValues) ? selectedValues : [])],
    [selectedValues],
  );
  const allSelected = Boolean(options.length) && normalizedSelectedValues.length === options.length;

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handlePointerDown(event) {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [open]);

  function toggleValue(value) {
    if (normalizedSelectedValues.includes(value)) {
      onChange(normalizedSelectedValues.filter((item) => item !== value));
      return;
    }

    onChange([...normalizedSelectedValues, value]);
  }

  function handleSelectAll() {
    onChange(options.map((option) => option.value));
  }

  function handleClear() {
    onChange([]);
  }

  return (
    <label className="field">
      <span>{label}</span>
      <div
        ref={rootRef}
        className={`multi-select ${open ? 'multi-select--open' : ''} ${disabled ? 'multi-select--disabled' : ''}`}
      >
        <button
          type="button"
          className="multi-select__trigger"
          onClick={() => !disabled && setOpen((current) => !current)}
          disabled={disabled}
          aria-expanded={open}
        >
          <span
            className={`multi-select__value ${normalizedSelectedValues.length ? '' : 'multi-select__value--placeholder'}`}
          >
            {buildSelectionLabel(options, normalizedSelectedValues, placeholder)}
          </span>
          <span className="multi-select__summary">
            {normalizedSelectedValues.length ? `${normalizedSelectedValues.length} выбрано` : 'Не выбрано'}
          </span>
          <ChevronDown
            size={18}
            className={`multi-select__icon ${open ? 'multi-select__icon--open' : ''}`}
          />
        </button>

        {open ? (
          <div className="multi-select__menu">
            <div className="multi-select__actions">
              <button type="button" className="multi-select__action" onClick={handleSelectAll}>
                Выбрать все
              </button>
              <button type="button" className="multi-select__action" onClick={handleClear}>
                Очистить
              </button>
            </div>

            {options.length ? (
              <div className="multi-select__options">
                {options.map((option) => {
                  const checked = normalizedSelectedValues.includes(option.value);

                  return (
                    <label key={option.value} className={`multi-select__option ${checked ? 'multi-select__option--active' : ''}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleValue(option.value)}
                      />
                      <span className="multi-select__checkbox">
                        {checked ? <Check size={14} /> : null}
                      </span>
                      <span className="multi-select__option-label">{option.label}</span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <div className="multi-select__empty">
                Нет доступных значений
              </div>
            )}

            <div className="multi-select__footer">
              {allSelected ? 'Выбраны все доступные значения' : `Выбрано: ${normalizedSelectedValues.length}`}
            </div>
          </div>
        ) : null}
      </div>
    </label>
  );
}
