import './QuestionRenderer.css';

function getUniqueOptions(options) {
  return [...new Set(
    (Array.isArray(options) ? options : [])
      .map((item) => String(item).trim())
      .filter(Boolean),
  )];
}

export default function QuestionRenderer({ question, value, onChange }) {
  const {
    type,
    options,
    scaleMin = 1,
    scaleMax = 10,
    scaleMinLabel = 'Не рекомендую',
    scaleMaxLabel = 'Рекомендую',
    rows,
    columns,
  } = question;
  const normalizedOptions = getUniqueOptions(options);

  switch (type) {
    case 'single':
      return (
        <div className="question-renderer">
          <div className="question-options">
            {normalizedOptions.map((opt, idx) => (
              <label key={idx} className={`question-option ${value === opt ? 'question-option--selected' : ''}`}>
                <input
                  type="radio"
                  name={`q-${question.id}`}
                  value={opt}
                  checked={value === opt}
                  onChange={() => onChange(opt)}
                  className="question-option__input"
                />
                <span className="question-option__radio" />
                <span className="question-option__label">{opt}</span>
              </label>
            ))}
          </div>
        </div>
      );

    case 'multiple':
      return (
        <div className="question-renderer">
          <div className="question-options">
            {normalizedOptions.map((opt, idx) => {
              const selected = Array.isArray(value) && value.includes(opt);
              return (
                <label key={idx} className={`question-option ${selected ? 'question-option--selected' : ''}`}>
                  <input
                    type="checkbox"
                    value={opt}
                    checked={selected}
                    onChange={() => {
                      const current = Array.isArray(value) ? [...value] : [];
                      if (selected) {
                        onChange(current.filter((v) => v !== opt));
                      } else {
                        onChange([...current, opt]);
                      }
                    }}
                    className="question-option__input"
                  />
                  <span className="question-option__checkbox" />
                  <span className="question-option__label">{opt}</span>
                </label>
              );
            })}
          </div>
        </div>
      );

    case 'scale':
      return (
        <div className="question-renderer">
          <div className="question-scale">
            <span className="question-scale__label-left">{scaleMinLabel}</span>
            <div className="question-scale__buttons">
              {Array.from({ length: scaleMax - scaleMin + 1 }, (_, i) => {
                const val = scaleMin + i;
                const isSelected = value === val;
                const hue = ((val - scaleMin) / (scaleMax - scaleMin)) * 120;
                return (
                  <button
                    key={val}
                    type="button"
                    className={`question-scale__btn ${isSelected ? 'question-scale__btn--selected' : ''}`}
                    style={{
                      '--scale-color': `hsl(${hue}, 70%, 50%)`,
                      '--scale-bg': `hsl(${hue}, 70%, 95%)`,
                    }}
                    onClick={() => onChange(val)}
                  >
                    {val}
                  </button>
                );
              })}
            </div>
            <span className="question-scale__label-right">{scaleMaxLabel}</span>
          </div>
        </div>
      );

    case 'text':
      return (
        <div className="question-renderer">
          <textarea
            className="question-textarea"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Введите ваш ответ..."
            rows={4}
          />
        </div>
      );

    case 'matrix':
      return (
        <div className="question-renderer">
          <div className="question-matrix">
            <table className="question-matrix__table">
              <thead>
                <tr>
                  <th></th>
                  {columns?.map((col, idx) => (
                    <th key={idx}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows?.map((row, rowIdx) => (
                  <tr key={rowIdx}>
                    <td className="question-matrix__row-label">{row}</td>
                    {columns?.map((col, colIdx) => {
                      const matrixValue = value || {};
                      const isSelected = matrixValue[row] === col;
                      return (
                        <td key={colIdx} className="question-matrix__cell">
                          <label className={`question-matrix__radio ${isSelected ? 'question-matrix__radio--selected' : ''}`}>
                            <input
                              type="radio"
                              name={`matrix-${question.id}-${rowIdx}`}
                              checked={isSelected}
                              onChange={() => {
                                const newVal = { ...(value || {}), [row]: col };
                                onChange(newVal);
                              }}
                            />
                            <span className="question-matrix__dot" />
                          </label>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );

    default:
      return <div className="question-renderer">Неизвестный тип вопроса</div>;
  }
}
