import { useCallback, useEffect, useState } from 'react';
import { Archive, CircleDashed, LoaderCircle, Megaphone, Plus, Trash2 } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import Button from './Button.jsx';
import Input from './Input.jsx';
import MultiSelectDropdown from './MultiSelectDropdown.jsx';
import SurveyFlowBuilder from './SurveyFlowBuilder.jsx';
import { useToast } from '../hooks/useToast.jsx';
import { questionsAPI, surveysAPI, usersAPI } from '../services/api.js';

const EDITABLE_SURVEY_STATUSES = new Set(['draft', 'published', 'active']);
const BUILDER_QUESTION_TYPE_OPTIONS = [
  { value: 'single_choice', label: 'Одиночный выбор' },
  { value: 'multiple_choice', label: 'Множественный выбор' },
  { value: 'scale', label: 'Шкала / eNPS' },
  { value: 'rating', label: 'Рейтинг 1-5' },
  { value: 'matrix', label: 'Матричный вопрос' },
  { value: 'text', label: 'Текстовый ответ' },
];
const EMPTY_SURVEY_FORM = {
  title: '',
  description: '',
  anonymity: 'none',
  estimatedMinutes: 5,
  endsAt: '',
  targetRoles: [],
  targetDepartments: [],
};
const EMPTY_QUESTION_FORM = {
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
  branchOnly: false,
};

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

function getUniqueTrimmedLines(value) {
  return [...new Set(
    String(value || '')
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean),
  )];
}

function getUniqueValues(values) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((item) => String(item || '').trim())
      .filter(Boolean),
  )];
}

function getOrderedQuestions(survey) {
  const seen = new Set();

  return [...(survey?.questions || [])]
    .filter((question) => {
      const questionId = String(question?.id ?? '');

      if (!questionId || seen.has(questionId)) {
        return false;
      }

      seen.add(questionId);
      return true;
    })
    .sort((left, right) => left.order_num - right.order_num);
}

function getSurveyStatus(survey) {
  return String(survey?.status || '').toLowerCase();
}

function isEditableSurveyStatus(status) {
  return EDITABLE_SURVEY_STATUSES.has(String(status || '').toLowerCase());
}

function toDateTimeLocalValue(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const pad = (item) => String(item).padStart(2, '0');

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function buildSurveyFormState(survey) {
  if (!survey) {
    return { ...EMPTY_SURVEY_FORM };
  }

  return {
    title: survey.title || '',
    description: survey.description || '',
    anonymity: survey.anonymity || 'none',
    estimatedMinutes: survey.estimated_minutes || 5,
    endsAt: toDateTimeLocalValue(survey.ends_at),
    targetRoles: Array.isArray(survey.target_roles) ? [...survey.target_roles] : [],
    targetDepartments: Array.isArray(survey.target_departments) ? [...survey.target_departments] : [],
  };
}

function buildSurveyPayload(form) {
  const targetRoles = getUniqueValues(form.targetRoles);
  const targetDepartments = getUniqueValues(form.targetDepartments);

  return {
    title: form.title,
    description: form.description,
    anonymity: form.anonymity,
    estimated_minutes: Number(form.estimatedMinutes || 5),
    ends_at: form.endsAt ? new Date(form.endsAt).toISOString() : null,
    target_roles: targetRoles.length ? targetRoles : null,
    target_departments: targetDepartments.length ? targetDepartments : null,
  };
}

function buildQuestionPayload(form) {
  const payload = {
    text: form.text,
    type: form.type,
    required: form.required,
    branch_only: form.branchOnly,
  };

  if (form.type === 'single_choice' || form.type === 'multiple_choice') {
    payload.options = getUniqueTrimmedLines(form.options);
  }

  if (form.type === 'scale' || form.type === 'rating') {
    payload.scale_min = Number(form.scaleMin || 1);
    payload.scale_max = Number(form.scaleMax || (form.type === 'rating' ? 5 : 10));
    payload.scale_min_label = form.scaleMinLabel || 'Совсем нет';
    payload.scale_max_label = form.scaleMaxLabel || 'Полностью да';
  }

  if (form.type === 'matrix') {
    payload.options = {
      rows: getUniqueTrimmedLines(form.matrixRows),
      columns: getUniqueTrimmedLines(form.matrixColumns),
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

function getRoleOptionLabel(role) {
  const normalized = String(role || '').toLowerCase();

  if (normalized === 'employee') {
    return 'Сотрудники';
  }

  if (normalized === 'hr') {
    return 'HR';
  }

  return role;
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
  const initialSurveyIdValue = initialSurveyId ? Number(initialSurveyId) : null;
  const [editableSurveys, setEditableSurveys] = useState([]);
  const [selectedSurveyId, setSelectedSurveyId] = useState(initialSurveyIdValue);
  const [selectedSurvey, setSelectedSurvey] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingSurvey, setSavingSurvey] = useState(false);
  const [savingQuestion, setSavingQuestion] = useState(false);
  const [loadingAudienceOptions, setLoadingAudienceOptions] = useState(true);
  const [audienceOptions, setAudienceOptions] = useState({
    roles: [],
    departments: [],
  });
  const [surveyForm, setSurveyForm] = useState(EMPTY_SURVEY_FORM);
  const [questionForm, setQuestionForm] = useState(EMPTY_QUESTION_FORM);

  const loadEditableSurveys = useCallback(async (preserveSelected = true, currentSelectedId = null) => {
    setLoading(true);
    try {
      const response = await surveysAPI.list({ per_page: 50 });
      const items = (response.items || []).filter((survey) => isEditableSurveyStatus(survey.status));
      setEditableSurveys(items);

      const nextId =
        preserveSelected && currentSelectedId && items.some((survey) => survey.id === currentSelectedId)
          ? currentSelectedId
          : items[0]?.id || null;

      setSelectedSurveyId(nextId);
    } catch (loadError) {
      error(loadError.message || 'Не удалось загрузить опросы для редактирования.');
    } finally {
      setLoading(false);
    }
  }, [error]);

  const loadAudienceOptions = useCallback(async () => {
    setLoadingAudienceOptions(true);
    try {
      const response = await usersAPI.audienceOptions();
      setAudienceOptions({
        roles: Array.isArray(response?.roles) ? response.roles : [],
        departments: Array.isArray(response?.departments) ? response.departments : [],
      });
    } catch (loadError) {
      error(loadError.message || 'Не удалось загрузить роли и подразделения для аудитории опроса.');
    } finally {
      setLoadingAudienceOptions(false);
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
    loadEditableSurveys(Boolean(initialSurveyIdValue), initialSurveyIdValue);
  }, [initialSurveyIdValue, loadEditableSurveys]);

  useEffect(() => {
    loadAudienceOptions();
  }, [loadAudienceOptions]);

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
          setSurveyForm(buildSurveyFormState(survey));
        }
      } catch (loadError) {
        if (active) {
          error(loadError.message || 'Не удалось открыть выбранный опрос.');
        }
      }
    }

    loadSelected();

    return () => {
      active = false;
    };
  }, [error, selectedSurveyId]);

  async function saveSurvey(event) {
    event.preventDefault();
    setSavingSurvey(true);

    try {
      if (selectedSurvey && !isEditableSurveyStatus(selectedSurvey.status)) {
        error('Этот опрос сейчас доступен только для просмотра.');
        return;
      }

      if (selectedSurvey && isEditableSurveyStatus(selectedSurvey.status)) {
        await surveysAPI.update(selectedSurveyId, buildSurveyPayload(surveyForm));
        success('Опрос обновлён. Изменения сохранены.');
        await refreshSelectedSurvey(selectedSurveyId);
        await loadEditableSurveys(true, selectedSurveyId);
      } else {
        const created = await surveysAPI.create(buildSurveyPayload(surveyForm));
        success('Черновик создан. Можно наполнять его вопросами.');
        setSurveyForm({ ...EMPTY_SURVEY_FORM });
        await loadEditableSurveys(false);
        setSelectedSurveyId(created.id);
      }
    } catch (saveError) {
      error(saveError.message || 'Не удалось сохранить опрос.');
    } finally {
      setSavingSurvey(false);
    }
  }

  async function createQuestion(event) {
    event.preventDefault();
    if (!selectedSurveyId) {
      error('Сначала создайте или выберите опрос.');
      return;
    }

    if (!canEditSelectedSurvey) {
      error('Этот опрос сейчас недоступен для редактирования.');
      return;
    }

    setSavingQuestion(true);

    try {
      await questionsAPI.create(selectedSurveyId, buildQuestionPayload(questionForm));
      success('Вопрос добавлен.');
      setQuestionForm({ ...EMPTY_QUESTION_FORM });
      await refreshSelectedSurvey(selectedSurveyId);
      await loadEditableSurveys(true, selectedSurveyId);
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
      await refreshSelectedSurvey(selectedSurveyId);
      await loadEditableSurveys(true, selectedSurveyId);
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

  async function archiveSelectedSurvey() {
    if (!selectedSurveyId || !selectedSurvey) {
      return;
    }

    if (!window.confirm(`Скрыть опрос "${selectedSurvey.title}"? Он пропадёт из доступа сотрудников и уйдёт в архив.`)) {
      return;
    }

    try {
      await surveysAPI.archive(selectedSurveyId);
      success('Опрос скрыт и перемещён в архив.');
      setSelectedSurvey(null);
      setSelectedSurveyId(null);
      setSurveyForm({ ...EMPTY_SURVEY_FORM });
      setQuestionForm({ ...EMPTY_QUESTION_FORM });
      await loadEditableSurveys(false);
    } catch (archiveError) {
      error(archiveError.message || 'Не удалось скрыть опрос.');
    }
  }

  async function deleteSelectedSurvey() {
    if (!selectedSurveyId || !selectedSurvey) {
      return;
    }

    if (!window.confirm(`Удалить опрос "${selectedSurvey.title}" полностью? Это действие необратимо.`)) {
      return;
    }

    try {
      await surveysAPI.remove(selectedSurveyId);
      success('Опрос удалён.');
      setSelectedSurvey(null);
      setSelectedSurveyId(null);
      setSurveyForm({ ...EMPTY_SURVEY_FORM });
      setQuestionForm({ ...EMPTY_QUESTION_FORM });
      await loadEditableSurveys(false);
    } catch (deleteError) {
      error(deleteError.message || 'Не удалось удалить опрос.');
    }
  }

  function startNewSurveyDraft() {
    setSelectedSurvey(null);
    setSelectedSurveyId(null);
    setSurveyForm({ ...EMPTY_SURVEY_FORM });
    setQuestionForm({ ...EMPTY_QUESTION_FORM });
  }

  const selectedSurveyStatus = getSurveyStatus(selectedSurvey);
  const canEditSelectedSurvey = selectedSurvey ? isEditableSurveyStatus(selectedSurveyStatus) : false;
  const canPublishSelectedSurvey = selectedSurveyStatus === 'draft';
  const selectedQuestions = selectedSurvey ? getOrderedQuestions(selectedSurvey) : [];
  const roleOptions = audienceOptions.roles.map((role) => ({
    value: role,
    label: getRoleOptionLabel(role),
  }));
  const departmentOptions = audienceOptions.departments.map((department) => ({
    value: department,
    label: department,
  }));

  return (
    <div className="page-stack">
      <section className="panel panel--soft">
        <div className="section-header">
          <div>
            <span className="panel__eyebrow">Конструктор опросов</span>
            <h2>Карточки вопросов, стрелки переходов и живой сценарий на одном холсте</h2>
          </div>
          <div className="header-actions">
            {canPublishSelectedSurvey ? (
              <Button icon={Megaphone} onClick={publishSurvey}>
                Опубликовать черновик
              </Button>
            ) : null}
            {selectedSurvey ? (
              <Button variant="secondary" icon={Archive} onClick={archiveSelectedSurvey}>
                Скрыть
              </Button>
            ) : null}
            {selectedSurvey ? (
              <Button variant="danger" icon={Trash2} onClick={deleteSelectedSurvey}>
                Удалить
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="builder-grid builder-grid--setup">
        <div className="panel">
          <div className="panel__header">
            <div>
              <span className="panel__eyebrow">
                {canEditSelectedSurvey ? 'Редактирование опроса' : 'Создание черновика'}
              </span>
              <h3>{canEditSelectedSurvey ? 'Параметры выбранного опроса' : 'Параметры опроса'}</h3>
            </div>
          </div>
          <div className="builder-note builder-note--inline">
            <strong>{getAnonymityTitle(surveyForm.anonymity)}</strong>
            <p>{getAnonymityDescription(surveyForm.anonymity)}</p>
          </div>
          <form className="form-grid" onSubmit={saveSurvey}>
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
              label="Целевые роли через запятую"
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
            <div className="builder-note">
              <strong>Пустая аудитория = рассылка всем</strong>
              <p>
                Если не заполнять роли и подразделения, опубликованный опрос сразу уйдёт всей
                доступной аудитории компании.
              </p>
            </div>
            <Button
              type="submit"
              loading={savingSurvey}
              icon={canEditSelectedSurvey ? undefined : Plus}
            >
              {canEditSelectedSurvey ? 'Сохранить изменения' : 'Создать черновик'}
            </Button>
            {canEditSelectedSurvey ? (
              <Button type="button" variant="secondary" onClick={startNewSurveyDraft}>
                Новый черновик
              </Button>
            ) : null}
          </form>
        </div>

        <div className="panel">
          <div className="panel__header">
            <div>
              <span className="panel__eyebrow">Опросы</span>
              <h3>Доступные для редактирования</h3>
            </div>
          </div>
          {loading ? (
            <InlineLoader label="Загружаем опросы..." />
          ) : (
            <div className="draft-list">
              {editableSurveys.map((draft) => (
                <button
                  type="button"
                  key={draft.id}
                  className={`draft-card ${selectedSurveyId === draft.id ? 'draft-card--active' : ''}`}
                  onClick={() => setSelectedSurveyId(draft.id)}
                >
                  <strong>{draft.title}</strong>
                  <span>{draft.status === 'draft' ? 'Черновик' : draft.status === 'published' ? 'Опубликован' : 'Активен'}</span>
                  <span>{draft.responses_count || 0} ответов</span>
                  <small>до {formatDate(draft.ends_at)}</small>
                </button>
              ))}
              {!editableSurveys.length ? (
                <CompactEmptyState
                  title="Редактируемых опросов пока нет"
                  description="Создайте первый опрос слева, и он появится здесь."
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
              <h3>{selectedSurvey ? 'Наполнение выбранного опроса' : 'Наполнение опроса'}</h3>
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

            <label className="field field--checkbox">
              <input
                type="checkbox"
                checked={questionForm.branchOnly}
                onChange={(event) =>
                  setQuestionForm((current) => ({
                    ...current,
                    branchOnly: event.target.checked,
                  }))
                }
              />
              <span>Только по ветке</span>
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
              <p>
                Вопросы с режимом "Только по ветке" не попадают в общий поток и открываются
                только по стрелке от нужного ответа.
              </p>
            </div>
            <Button type="submit" loading={savingQuestion} icon={Plus} disabled={!canEditSelectedSurvey}>
              Добавить вопрос
            </Button>
          </form>
        </div>

        <div className="panel panel--builder-canvas">
          <div className="panel__header">
            <div>
              <span className="panel__eyebrow">Текущий сценарий</span>
              <h3>{selectedSurvey?.title || 'Выберите опрос'}</h3>
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
                        <div className="question-list__meta">
                          <p>{BUILDER_QUESTION_TYPE_OPTIONS.find((item) => item.value === question.type)?.label || question.type}</p>
                          {question.branch_only || question.branchOnly ? (
                            <span className="question-list__badge">Только по ветке</span>
                          ) : null}
                        </div>
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
              title="Опрос не выбран"
              description="Сначала выберите опрос из списка справа."
            />
          )}
        </div>
      </section>

      <section className="panel panel--builder-editor">
        <div className="panel__header">
          <div>
            <span className="panel__eyebrow">Редактор опросов</span>
            <h3>{selectedSurvey?.title || 'Выберите опрос для редактирования'}</h3>
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
            title="Нет активного опроса"
            description="Сначала выберите или создайте опрос, после этого откроется редактор."
          />
        )}
      </section>
    </div>
  );
}
