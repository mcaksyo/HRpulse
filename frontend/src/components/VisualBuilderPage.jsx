import { useCallback, useEffect, useState } from 'react';
import { CircleDashed, LoaderCircle, Megaphone, Plus } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import Button from './Button.jsx';
import Input from './Input.jsx';
import SurveyFlowBuilder from './SurveyFlowBuilder.jsx';
import { useToast } from '../hooks/useToast.jsx';
import { questionsAPI, surveysAPI } from '../services/api.js';

const BUILDER_QUESTION_TYPE_OPTIONS = [
  { value: 'single_choice', label: 'Одиночный выбор' },
  { value: 'multiple_choice', label: 'Множественный выбор' },
  { value: 'scale', label: 'Шкала / eNPS' },
  { value: 'rating', label: 'Рейтинг 1-5' },
  { value: 'matrix', label: 'Матричный вопрос' },
  { value: 'text', label: 'Текстовый ответ' },
];

function formatDate(value) {
  if (!value) {
    return 'Без срока';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Без срока';
  }

  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'short',
  });
}

function getOrderedQuestions(survey) {
  return [...(survey?.questions || [])].sort((left, right) => left.order_num - right.order_num);
}

function buildSurveyPayload(form) {
  return {
    title: form.title,
    description: form.description,
    anonymity: form.anonymity,
    estimated_minutes: Number(form.estimatedMinutes || 5),
    ends_at: form.endsAt ? new Date(form.endsAt).toISOString() : null,
    target_roles: form.targetRoles ? [form.targetRoles] : null,
    target_departments: form.targetDepartments
      ? form.targetDepartments
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      : null,
  };
}

function buildQuestionPayload(form) {
  const payload = {
    text: form.text,
    type: form.type,
    required: form.required,
  };

  if (form.type === 'single_choice' || form.type === 'multiple_choice') {
    payload.options = form.options
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (form.type === 'scale' || form.type === 'rating') {
    payload.scale_min = Number(form.scaleMin || 1);
    payload.scale_max = Number(form.scaleMax || (form.type === 'rating' ? 5 : 10));
    payload.scale_min_label = form.scaleMinLabel || 'Совсем нет';
    payload.scale_max_label = form.scaleMaxLabel || 'Полностью да';
  }

  if (form.type === 'matrix') {
    payload.options = {
      rows: form.matrixRows
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean),
      columns: form.matrixColumns
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean),
    };
  }

  return payload;
}

function getAnonymityTitle(mode) {
  const normalized = String(mode || '').toLowerCase();

  if (normalized === 'full') {
    return 'Полная анонимность';
  }

  if (normalized === 'partial') {
    return 'Частичная анонимность';
  }

  return 'Идентифицированный режим';
}

function getAnonymityDescription(mode) {
  const normalized = String(mode || '').toLowerCase();

  if (normalized === 'full') {
    return 'HR видит только агрегированные ответы без имён, отделов и привязки к человеку.';
  }

  if (normalized === 'partial') {
    return 'HR видит срезы по отделам, но не видит имена конкретных сотрудников.';
  }

  return 'HR видит, кто именно ответил, и может выгружать ответы с именем и отделом сотрудника.';
}

function InlineLoader({ label }) {
  return (
    <div className="page-loader page-loader--compact">
      <LoaderCircle className="spin" size={24} />
      <span>{label}</span>
    </div>
  );
}

function CompactEmptyState({ title, description }) {
  return (
    <div className="empty-state empty-state--compact">
      <CircleDashed size={22} />
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

export default function VisualBuilderPage() {
  const { success, error } = useToast();
  const location = useLocation();
  const initialSurveyId = new URLSearchParams(location.search).get('survey');
  const [drafts, setDrafts] = useState([]);
  const [selectedSurveyId, setSelectedSurveyId] = useState(initialSurveyId ? Number(initialSurveyId) : null);
  const [selectedSurvey, setSelectedSurvey] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingSurvey, setSavingSurvey] = useState(false);
  const [savingQuestion, setSavingQuestion] = useState(false);
  const [surveyForm, setSurveyForm] = useState({
    title: '',
    description: '',
    anonymity: 'none',
    estimatedMinutes: 5,
    endsAt: '',
    targetRoles: '',
    targetDepartments: '',
  });
  const [questionForm, setQuestionForm] = useState({
    text: '',
    type: 'single_choice',
    options: '',
    scaleMin: 1,
    scaleMax: 10,
    scaleMinLabel: 'Совсем нет',
    scaleMaxLabel: 'Полностью да',
    matrixRows: '',
    matrixColumns: '',
    required: true,
  });

  const loadDrafts = useCallback(async (preserveSelected = true, currentSelectedId = null) => {
    setLoading(true);
    try {
      const response = await surveysAPI.list({ status: 'draft', per_page: 50 });
      setDrafts(response.items || []);

      const nextId =
        preserveSelected && currentSelectedId
          ? currentSelectedId
          : response.items?.[0]?.id || null;

      setSelectedSurveyId(nextId);
    } catch (loadError) {
      error(loadError.message || 'Не удалось загрузить черновики.');
    } finally {
      setLoading(false);
    }
  }, [error]);

  async function refreshSelectedSurvey(targetSurveyId = selectedSurveyId) {
    if (!targetSurveyId) {
      setSelectedSurvey(null);
      return null;
    }

    const survey = await surveysAPI.get(targetSurveyId);
    setSelectedSurvey(survey);
    return survey;
  }

  useEffect(() => {
    loadDrafts(false);
  }, [loadDrafts]);

  useEffect(() => {
    let active = true;

    async function loadSelected() {
      if (!selectedSurveyId) {
        setSelectedSurvey(null);
        return;
      }

      try {
        const survey = await surveysAPI.get(selectedSurveyId);
        if (active) {
          setSelectedSurvey(survey);
        }
      } catch (loadError) {
        if (active) {
          error(loadError.message || 'Не удалось открыть выбранный черновик.');
        }
      }
    }

    loadSelected();

    return () => {
      active = false;
    };
  }, [error, selectedSurveyId]);

  async function createSurvey(event) {
    event.preventDefault();
    setSavingSurvey(true);

    try {
      const created = await surveysAPI.create(buildSurveyPayload(surveyForm));
      success('Черновик создан. Можно наполнять его вопросами.');
      setSurveyForm({
        title: '',
        description: '',
        anonymity: 'none',
        estimatedMinutes: 5,
        endsAt: '',
        targetRoles: '',
        targetDepartments: '',
      });
      await loadDrafts(false);
      setSelectedSurveyId(created.id);
    } catch (saveError) {
      error(saveError.message || 'Не удалось создать опрос.');
    } finally {
      setSavingSurvey(false);
    }
  }

  async function createQuestion(event) {
    event.preventDefault();
    if (!selectedSurveyId) {
      error('Сначала создайте или выберите черновик.');
      return;
    }

    setSavingQuestion(true);

    try {
      await questionsAPI.create(selectedSurveyId, buildQuestionPayload(questionForm));
      success('Вопрос добавлен.');
      setQuestionForm({
        text: '',
        type: 'single_choice',
        options: '',
        scaleMin: 1,
        scaleMax: 10,
        scaleMinLabel: 'Совсем нет',
        scaleMaxLabel: 'Полностью да',
        matrixRows: '',
        matrixColumns: '',
        required: true,
      });
      await refreshSelectedSurvey(selectedSurveyId);
      await loadDrafts(true, selectedSurveyId);
    } catch (saveError) {
      error(saveError.message || 'Не удалось добавить вопрос.');
    } finally {
      setSavingQuestion(false);
    }
  }

  async function publishSurvey() {
    if (!selectedSurveyId) {
      return;
    }

    try {
      await surveysAPI.publish(selectedSurveyId);
      success('Опрос опубликован, каскад уведомлений запущен.');
      await loadDrafts(false);
      setSelectedSurvey(null);
      setSelectedSurveyId(null);
    } catch (publishError) {
      error(publishError.message || 'Не удалось опубликовать опрос.');
    }
  }

  async function removeQuestion(questionId) {
    if (!selectedSurveyId) {
      return;
    }

    try {
      await questionsAPI.remove(selectedSurveyId, questionId);
      success('Вопрос удалён.');
      await refreshSelectedSurvey(selectedSurveyId);
    } catch (removeError) {
      error(removeError.message || 'Не удалось удалить вопрос.');
    }
  }

  const selectedQuestions = selectedSurvey ? getOrderedQuestions(selectedSurvey) : [];

  return (
    <div className="page-stack">
      <section className="panel panel--soft">
        <div className="section-header">
          <div>
            <span className="panel__eyebrow">Конструктор опросов</span>
            <h2>Карточки вопросов, стрелки переходов и живой сценарий на одном холсте</h2>
          </div>
          {selectedSurvey ? (
            <Button icon={Megaphone} onClick={publishSurvey}>
              Опубликовать черновик
            </Button>
          ) : null}
        </div>
      </section>

      <section className="builder-grid builder-grid--setup">
        <div className="panel">
          <div className="panel__header">
            <div>
              <span className="panel__eyebrow">Создание черновика</span>
              <h3>Параметры опроса</h3>
            </div>
          </div>
          <div className="builder-note builder-note--inline">
            <strong>{getAnonymityTitle(surveyForm.anonymity)}</strong>
            <p>{getAnonymityDescription(surveyForm.anonymity)}</p>
          </div>
          <form className="form-grid" onSubmit={createSurvey}>
            <Input
              label="Название"
              value={surveyForm.title}
              onChange={(event) =>
                setSurveyForm((current) => ({ ...current, title: event.target.value }))
              }
              fullWidth
            />
            <Input
              label="Описание"
              type="textarea"
              value={surveyForm.description}
              onChange={(event) =>
                setSurveyForm((current) => ({ ...current, description: event.target.value }))
              }
              fullWidth
            />
            <label className="field">
              <span>Анонимность</span>
              <select
                value={surveyForm.anonymity}
                onChange={(event) =>
                  setSurveyForm((current) => ({ ...current, anonymity: event.target.value }))
                }
              >
                <option value="none">Идентифицированный режим</option>
                <option value="partial">Частичная анонимность</option>
                <option value="full">Полная анонимность</option>
              </select>
            </label>
            <label className="field">
              <span>Ожидаемое время, мин</span>
              <input
                type="number"
                min="1"
                max="120"
                value={surveyForm.estimatedMinutes}
                onChange={(event) =>
                  setSurveyForm((current) => ({
                    ...current,
                    estimatedMinutes: event.target.value,
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Дата окончания</span>
              <input
                type="datetime-local"
                value={surveyForm.endsAt}
                onChange={(event) =>
                  setSurveyForm((current) => ({ ...current, endsAt: event.target.value }))
                }
              />
            </label>
            <Input
              label="Целевая роль"
              value={surveyForm.targetRoles}
              onChange={(event) =>
                setSurveyForm((current) => ({ ...current, targetRoles: event.target.value }))
              }
              placeholder="employee"
              fullWidth
            />
            <Input
              label="Подразделения через запятую"
              value={surveyForm.targetDepartments}
              onChange={(event) =>
                setSurveyForm((current) => ({
                  ...current,
                  targetDepartments: event.target.value,
                }))
              }
              placeholder="Розница, Офис, HR"
              fullWidth
            />
            <Button type="submit" loading={savingSurvey} icon={Plus}>
              Создать черновик
            </Button>
          </form>
        </div>

        <div className="panel">
          <div className="panel__header">
            <div>
              <span className="panel__eyebrow">Черновики</span>
              <h3>Текущие заготовки</h3>
            </div>
          </div>
          {loading ? (
            <InlineLoader label="Загружаем черновики..." />
          ) : (
            <div className="draft-list">
              {drafts.map((draft) => (
                <button
                  type="button"
                  key={draft.id}
                  className={`draft-card ${selectedSurveyId === draft.id ? 'draft-card--active' : ''}`}
                  onClick={() => setSelectedSurveyId(draft.id)}
                >
                  <strong>{draft.title}</strong>
                  <span>{draft.responses_count || 0} ответов</span>
                  <small>до {formatDate(draft.ends_at)}</small>
                </button>
              ))}
              {!drafts.length ? (
                <CompactEmptyState
                  title="Черновиков пока нет"
                  description="Создайте первый шаблон слева, и он появится здесь."
                />
              ) : null}
            </div>
          )}
        </div>
      </section>

      <section className="builder-workbench">
        <div className="panel panel--builder-form">
          <div className="panel__header">
            <div>
              <span className="panel__eyebrow">Новый вопрос</span>
              <h3>Наполнение черновика</h3>
            </div>
          </div>
          <form className="form-grid" onSubmit={createQuestion}>
            <Input
              label="Текст вопроса"
              value={questionForm.text}
              onChange={(event) =>
                setQuestionForm((current) => ({ ...current, text: event.target.value }))
              }
              fullWidth
            />
            <label className="field">
              <span>Тип вопроса</span>
              <select
                value={questionForm.type}
                onChange={(event) =>
                  setQuestionForm((current) => ({ ...current, type: event.target.value }))
                }
              >
                {BUILDER_QUESTION_TYPE_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field field--checkbox">
              <input
                type="checkbox"
                checked={questionForm.required}
                onChange={(event) =>
                  setQuestionForm((current) => ({ ...current, required: event.target.checked }))
                }
              />
              <span>Обязательный вопрос</span>
            </label>

            {questionForm.type === 'single_choice' || questionForm.type === 'multiple_choice' ? (
              <Input
                label="Варианты, каждый с новой строки"
                type="textarea"
                value={questionForm.options}
                onChange={(event) =>
                  setQuestionForm((current) => ({ ...current, options: event.target.value }))
                }
                fullWidth
              />
            ) : null}

            {questionForm.type === 'scale' || questionForm.type === 'rating' ? (
              <>
                <label className="field">
                  <span>Минимум</span>
                  <input
                    type="number"
                    value={questionForm.scaleMin}
                    onChange={(event) =>
                      setQuestionForm((current) => ({ ...current, scaleMin: event.target.value }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Максимум</span>
                  <input
                    type="number"
                    value={questionForm.scaleMax}
                    onChange={(event) =>
                      setQuestionForm((current) => ({ ...current, scaleMax: event.target.value }))
                    }
                  />
                </label>
                <Input
                  label="Подпись минимума"
                  value={questionForm.scaleMinLabel}
                  onChange={(event) =>
                    setQuestionForm((current) => ({
                      ...current,
                      scaleMinLabel: event.target.value,
                    }))
                  }
                  fullWidth
                />
                <Input
                  label="Подпись максимума"
                  value={questionForm.scaleMaxLabel}
                  onChange={(event) =>
                    setQuestionForm((current) => ({
                      ...current,
                      scaleMaxLabel: event.target.value,
                    }))
                  }
                  fullWidth
                />
              </>
            ) : null}

            {questionForm.type === 'matrix' ? (
              <>
                <Input
                  label="Строки матрицы, каждая с новой строки"
                  type="textarea"
                  value={questionForm.matrixRows}
                  onChange={(event) =>
                    setQuestionForm((current) => ({ ...current, matrixRows: event.target.value }))
                  }
                  fullWidth
                />
                <Input
                  label="Колонки матрицы, каждая с новой строки"
                  type="textarea"
                  value={questionForm.matrixColumns}
                  onChange={(event) =>
                    setQuestionForm((current) => ({
                      ...current,
                      matrixColumns: event.target.value,
                    }))
                  }
                  fullWidth
                />
              </>
            ) : null}

            <div className="builder-note">
              <strong>После добавления вопроса он появится на холсте как карточка</strong>
              <p>
                Двигайте карточки в пространстве, а стрелки тяните от конкретных ответов к нужным
                шагам сценария.
              </p>
            </div>
            <Button type="submit" loading={savingQuestion} icon={Plus}>
              Добавить вопрос
            </Button>
          </form>
        </div>

        <div className="panel panel--builder-canvas">
          <div className="panel__header">
            <div>
              <span className="panel__eyebrow">Текущий сценарий</span>
              <h3>{selectedSurvey?.title || 'Выберите черновик'}</h3>
            </div>
          </div>
          {selectedSurvey ? (
            <>
              <div className="builder-note builder-note--inline">
                <strong>{selectedQuestions.length || 0} вопросов в сценарии</strong>
                <p>
                  Здесь только краткая сводка. Полный визуальный редактор вынесен в отдельный блок
                  ниже, чтобы ему хватало ширины.
                </p>
              </div>
              {selectedQuestions.length ? (
                <div className="question-list">
                  {selectedQuestions.map((question, index) => (
                    <div key={question.id} className="question-list__item">
                      <div className="question-list__index">{index + 1}</div>
                      <div className="question-list__content">
                        <strong>{question.text}</strong>
                        <p>{BUILDER_QUESTION_TYPE_OPTIONS.find((item) => item.value === question.type)?.label || question.type}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <CompactEmptyState
                  title="Вопросов пока нет"
                  description="Добавьте первый вопрос, и он появится в редакторе ниже."
                />
              )}
            </>
          ) : (
            <CompactEmptyState
              title="Черновик не выбран"
              description="Сначала выберите опрос из списка справа."
            />
          )}
        </div>
      </section>

      <section className="panel panel--builder-editor">
        <div className="panel__header">
          <div>
            <span className="panel__eyebrow">Редактор опросов</span>
            <h3>{selectedSurvey?.title || 'Выберите черновик для редактирования'}</h3>
          </div>
        </div>
        {selectedSurvey ? (
          selectedQuestions.length ? (
            <SurveyFlowBuilder
              surveyId={selectedSurveyId}
              questions={selectedQuestions}
              onRefresh={() => refreshSelectedSurvey(selectedSurveyId)}
              onRemoveQuestion={removeQuestion}
              onSuccess={success}
              onError={error}
            />
          ) : (
            <CompactEmptyState
              title="Редактор пока пуст"
              description="Добавьте первый вопрос сверху, и здесь появятся карточки и связи."
            />
          )
        ) : (
          <CompactEmptyState
            title="Нет активного черновика"
            description="Сначала выберите или создайте опрос, после этого откроется редактор."
          />
        )}
      </section>
    </div>
  );
}
