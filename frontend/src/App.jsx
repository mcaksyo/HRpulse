import { useCallback, useEffect, useState } from 'react';
import {
  NavLink,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import {
  ArrowRight,
  BadgeCheck,
  Bell,
  BrainCircuit,
  CalendarDays,
  ChartColumn,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Clock3,
  FileSpreadsheet,
  LoaderCircle,
  LogOut,
  MessageSquareQuote,
  PanelsTopLeft,
  Plus,
  RadioTower,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
  UserRound,
  Users,
} from 'lucide-react';
import './App.css';
import Button from './components/Button.jsx';
import CircularProgress from './components/CircularProgress.jsx';
import Input from './components/Input.jsx';
import ProgressBar from './components/ProgressBar.jsx';
import QuestionRenderer from './components/QuestionRenderer.jsx';
import StatsCard from './components/StatsCard.jsx';
import SurveyCard from './components/SurveyCard.jsx';
import VisualBuilderPage from './components/VisualBuilderPage.jsx';
import { useAuth } from './hooks/useAuth.jsx';
import { usePush } from './hooks/usePush.js';
import { useToast } from './hooks/useToast.jsx';
import {
  analyticsAPI,
  notificationsAPI,
  responsesAPI,
  surveysAPI,
  usersAPI,
} from './services/api.js';

const HR_NAV = [
  { to: '/dashboard', label: 'Главная', icon: PanelsTopLeft },
  { to: '/surveys', label: 'Опросы', icon: MessageSquareQuote },
  { to: '/builder', label: 'Конструктор', icon: BrainCircuit },
  { to: '/profile', label: 'Профиль', icon: UserRound },
];

const EMPLOYEE_NAV = [
  { to: '/surveys', label: 'Мои опросы', icon: MessageSquareQuote },
  { to: '/profile', label: 'Уведомления', icon: Bell },
];

const STATUS_META = {
  draft: { badge: 'draft', label: 'Черновик' },
  published: { badge: 'active', label: 'Опубликован' },
  active: { badge: 'active', label: 'Активен' },
  closed: { badge: 'completed', label: 'Завершён' },
  archived: { badge: 'archived', label: 'Архив' },
};
const BUILDER_EDITABLE_STATUSES = new Set(['draft', 'published', 'active']);

const SKIP_BRANCH_VALUE = 'Пропустить вопрос';

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

function formatDateTime(value) {
  if (!value) {
    return 'Не указано';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Не указано';
  }

  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatPercent(value) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return '0%';
  }

  return `${Math.round(Number(value))}%`;
}

function normalizeQuestionType(type) {
  const raw = String(type || '').toLowerCase();

  if (['single', 'single_choice', 'radio', 'choice'].includes(raw)) {
    return 'single';
  }

  if (['multiple', 'multiple_choice', 'checkbox'].includes(raw)) {
    return 'multiple';
  }

  if (['text', 'textarea', 'open_text', 'free_text'].includes(raw)) {
    return 'text';
  }

  if (['scale', 'nps', 'enps', 'rating'].includes(raw)) {
    return 'scale';
  }

  if (raw === 'matrix') {
    return 'matrix';
  }

  return 'text';
}

function normalizeStatus(status) {
  return STATUS_META[String(status || '').toLowerCase()] || STATUS_META.active;
}

function canOpenBuilderForSurvey(survey) {
  return BUILDER_EDITABLE_STATUSES.has(String(survey?.status || '').toLowerCase());
}

function getDisplayName(user) {
  if (!user) {
    return 'Коллега';
  }

  return user.name || user.phone || 'Коллега';
}

function questionValueMatches(answer, expected) {
  if (expected === undefined || expected === null || expected === '') {
    return true;
  }

  if (Array.isArray(answer)) {
    return answer.includes(expected);
  }

  if (typeof answer === 'object' && answer !== null) {
    return Object.values(answer).includes(expected);
  }

  return String(answer) === String(expected);
}

function branchRuleMatches(rule, answers, fallbackQuestionId = null) {
  const sourceQuestionId = rule.condition_question_id ?? fallbackQuestionId;
  if (!sourceQuestionId) {
    return false;
  }

  const sourceAnswer = answers[sourceQuestionId];
  if (String(rule.condition_value ?? '') === SKIP_BRANCH_VALUE) {
    return (
      sourceAnswer === undefined ||
      sourceAnswer === null ||
      sourceAnswer === '' ||
      (Array.isArray(sourceAnswer) && sourceAnswer.length === 0) ||
      (typeof sourceAnswer === 'object' &&
        sourceAnswer !== null &&
        !Array.isArray(sourceAnswer) &&
        Object.keys(sourceAnswer).length === 0)
    );
  }

  if (sourceAnswer === undefined || sourceAnswer === null || sourceAnswer === '') {
    return false;
  }

  return questionValueMatches(sourceAnswer, rule.condition_value);
}

function isAnswerFilled(type, value) {
  const normalized = normalizeQuestionType(type);

  if (normalized === 'multiple') {
    return Array.isArray(value) && value.length > 0;
  }

  if (normalized === 'matrix') {
    return value && typeof value === 'object' && Object.keys(value).length > 0;
  }

  if (normalized === 'scale') {
    return value !== undefined && value !== null && value !== '';
  }

  return value !== undefined && value !== null && String(value).trim() !== '';
}

function normalizeQuestion(question) {
  const matrixOptions =
    question?.options && !Array.isArray(question.options) && typeof question.options === 'object'
      ? question.options
      : {};

  return {
    ...question,
    branchOnly: Boolean(question?.branch_only ?? question?.branchOnly),
    type: normalizeQuestionType(question.type),
    rows: question.rows || matrixOptions.rows || [],
    columns: question.columns || matrixOptions.columns || [],
    scaleMin: question.scale_min ?? question.scaleMin ?? 1,
    scaleMax: question.scale_max ?? question.scaleMax ?? 10,
    scaleMinLabel: question.scale_min_label ?? question.scaleMinLabel ?? 'Совсем нет',
    scaleMaxLabel: question.scale_max_label ?? question.scaleMaxLabel ?? 'Полностью да',
  };
}

function isBranchOnlyQuestion(question) {
  return Boolean(question?.branchOnly ?? question?.branch_only);
}

function getOrderedQuestions(survey) {
  return [...(survey?.questions || [])]
    .map(normalizeQuestion)
    .sort((left, right) => left.order_num - right.order_num);
}

function getVisibleQuestions(orderedQuestions, answers) {
  const questionIds = new Set(orderedQuestions.map((question) => question.id));
  const showTargets = new Set();
  const shownTargets = new Set();
  const branchTargets = new Set();
  const activeBranchTargets = new Set();
  const hiddenTargets = new Set();

  orderedQuestions.forEach((question) => {
    const rules = Array.isArray(question.branch_rules) ? question.branch_rules : [];

    rules.forEach((rule) => {
      if (!rule?.target_question_id || !questionIds.has(rule.target_question_id)) {
        return;
      }

      const action = String(rule.action || '').toLowerCase();
      const matches = branchRuleMatches(rule, answers, question.id);

      if (action === 'show') {
        showTargets.add(rule.target_question_id);
        branchTargets.add(rule.target_question_id);
        if (matches) {
          shownTargets.add(rule.target_question_id);
          activeBranchTargets.add(rule.target_question_id);
        }
      }

      if (action === 'skip_to' && matches) {
        branchTargets.add(rule.target_question_id);
        activeBranchTargets.add(rule.target_question_id);
      }

      if (action === 'hide' && matches) {
        hiddenTargets.add(rule.target_question_id);
      }
    });
  });

  return orderedQuestions.filter((question) => {
    if (hiddenTargets.has(question.id)) {
      return false;
    }

    if (isBranchOnlyQuestion(question)) {
      return branchTargets.has(question.id) && activeBranchTargets.has(question.id);
    }

    if (showTargets.has(question.id) && !shownTargets.has(question.id)) {
      return false;
    }

    return true;
  });
}

function getNextQuestionId(question, answers, orderedQuestions, visibleQuestions = orderedQuestions) {
  const rules = Array.isArray(question.branch_rules) ? question.branch_rules : [];
  const visibleIds = new Set(visibleQuestions.map((item) => item.id));

  for (const rule of rules) {
    if (
      String(rule.action || '').toLowerCase() === 'skip_to' &&
      rule.target_question_id &&
      branchRuleMatches(rule, answers, question.id)
    ) {
      if (visibleIds.has(rule.target_question_id)) {
        return rule.target_question_id;
      }

      const targetIndex = orderedQuestions.findIndex((item) => item.id === rule.target_question_id);
      if (targetIndex >= 0) {
        const fallback = orderedQuestions
          .slice(targetIndex + 1)
          .find((item) => visibleIds.has(item.id));
        return fallback?.id || null;
      }
    }
  }

  const currentIndex = visibleQuestions.findIndex((item) => item.id === question.id);
  return visibleQuestions[currentIndex + 1]?.id || null;
}

function toSurveyCard(survey, mode, totalEmployees = 0) {
  const status = normalizeStatus(survey.status);
  const completionRate =
    totalEmployees > 0 && survey.responses_count !== undefined
      ? Math.min(100, Math.round((survey.responses_count / totalEmployees) * 100))
      : undefined;

  return {
    id: survey.id,
    title: survey.title,
    description: survey.description,
    status: status.badge,
    deadline: formatDate(survey.ends_at),
    estimatedTime: survey.estimated_minutes,
    completionRate,
    responsesCount: survey.responses_count,
    totalTarget: totalEmployees || undefined,
    isNew: status.badge === 'active' && mode === 'employee',
  };
}

function getChannelLabel(channel) {
  const labels = {
    web_push: 'Веб-пуш',
    push: 'Веб-пуш',
    sms: 'SMS',
    email: 'Эл. почта',
    telegram: 'Telegram',
  };

  return labels[String(channel || '').toLowerCase()] || String(channel || 'Канал');
}

function getPreferenceLabel(key) {
  const labels = {
    web_push_enabled: 'Веб-пуш уведомления',
    sms_enabled: 'SMS-уведомления',
    telegram_enabled: 'Уведомления в Telegram',
    email_enabled: 'Уведомления по эл. почте',
  };

  return labels[String(key || '').toLowerCase()] || String(key || '').replaceAll('_', ' ');
}

function getNotificationStatusLabel(status) {
  const labels = {
    pending: 'В очереди',
    sent: 'Отправлено',
    delivered: 'Доставлено',
    failed: 'Ошибка доставки',
    opened: 'Открыто',
    clicked: 'Переход выполнен',
  };

  return labels[String(status || '').toLowerCase()] || String(status || 'Событие');
}

function getAnonymityDescription(mode) {
  const normalized = String(mode || '').toLowerCase();

  if (normalized === 'full') {
    return 'HR видит только агрегированные ответы. Имя, отдел и конкретный сотрудник в результатах не раскрываются.';
  }

  if (normalized === 'partial') {
    return 'HR видит ответы в разрезе подразделений, но без имён сотрудников. Подходит для командных срезов без персонализации.';
  }

  return 'HR видит, кто именно ответил, и может выгружать ответы с именем и отделом сотрудника.';
}

function LoginPage() {
  const { isAuthenticated, isHR, sendOTP, verifyOTP } = useAuth();
  const { success, error, info, warning } = useToast();
  const navigate = useNavigate();
  const [phone, setPhone] = useState('+7 ');
  const [code, setCode] = useState('');
  const [step, setStep] = useState('phone');
  const [loading, setLoading] = useState(false);
  const [debugCode, setDebugCode] = useState('');

  useEffect(() => {
    if (isAuthenticated) {
      navigate(isHR ? '/dashboard' : '/surveys', { replace: true });
    }
  }, [isAuthenticated, isHR, navigate]);

  async function requestCode(event) {
    event.preventDefault();
    setLoading(true);

    const result = await sendOTP(phone);
    setLoading(false);

    if (result.success) {
      setStep('code');
      setDebugCode(result.debugCode || '');
      success('Код отправлен. Можно продолжать авторизацию.');
      if (result.warning) {
        warning(result.warning);
      }
      return;
    }

    error(result.error || 'Не удалось отправить код.');
  }

  async function confirmCode(event) {
    event.preventDefault();
    setLoading(true);

    const result = await verifyOTP(phone, code);
    setLoading(false);

    if (!result.success) {
      error(result.error || 'Не удалось подтвердить код.');
      return;
    }

    if (result.demoMode) {
      info('Включён демо-режим. Для презентации этого достаточно.');
    } else {
      success('Авторизация успешна.');
    }

    navigate(
      String(result.user?.role || '').toLowerCase() === 'hr' ? '/dashboard' : '/surveys',
      { replace: true },
    );
  }

  return (
    <div className="auth-page">
      <section className="auth-art">
        <div className="auth-brand">
          <span className="auth-brand__caption">Корпоративный сервис СКС Ломбард</span>
          <h1>PulseHR</h1>
          <p>
            Пульс команды, автоматические опросы и аналитика вовлечённости в одном
            кабинете.
          </p>
        </div>

        <div className="hero-stack">
          <div className="hero-stack__card hero-stack__card--primary">
            <span className="hero-kicker">Новый опрос</span>
            <h3>Вовлечённость сотрудников 2026</h3>
            <p>Веб-пуш {'->'} SMS {'->'} Telegram. Всё под контролем HR.</p>
            <ProgressBar value={72} showPercent={false} />
          </div>
          <div className="hero-stack__card">
            <CircularProgress value={67} size={118} label="Прогресс" />
            <div>
              <h4>67% ответов</h4>
              <p>Сотрудники отвечают быстрее, когда уведомления доходят каскадом.</p>
            </div>
          </div>
          <div className="hero-pills">
            <span><RadioTower size={16} /> Push приоритет</span>
            <span><ShieldCheck size={16} /> Анонимность опроса</span>
            <span><ChartColumn size={16} /> eNPS и экспорт</span>
          </div>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-panel__box">
          <div className="auth-panel__header">
            <span className="auth-panel__logo">SKS</span>
            <div>
              <h2>Вход по SMS-коду</h2>
              <p>Для MVP можно использовать тестовый код `123456`.</p>
            </div>
          </div>

          {step === 'phone' ? (
            <form className="auth-form" onSubmit={requestCode}>
              <Input
                label="Номер телефона"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+7 900 123-45-67"
                fullWidth
              />
              <Button type="submit" fullWidth loading={loading} icon={Send}>
                Получить код
              </Button>
            </form>
          ) : (
            <form className="auth-form" onSubmit={confirmCode}>
              <Input
                label="Код из SMS"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="123456"
                fullWidth
              />
              {debugCode ? (
                <div className="debug-code">
                  Код для теста: <strong>{debugCode}</strong>
                </div>
              ) : null}
              <Button type="submit" fullWidth loading={loading} icon={BadgeCheck}>
                Войти
              </Button>
              <Button
                variant="ghost"
                fullWidth
                onClick={() => {
                  setStep('phone');
                  setCode('');
                }}
              >
                Изменить номер
              </Button>
            </form>
          )}

          <div className="auth-demo">
            <p>Быстрый вход для проверки ролей:</p>
            <button type="button" onClick={() => setPhone('+7 900 123-45-67')}>
              HR: +7 900 123-45-67
            </button>
            <button type="button" onClick={() => setPhone('+7 900 123-45-68')}>
              Сотрудник: +7 900 123-45-68
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function ProtectedRoute({ hrOnly = false }) {
  const { isAuthenticated, isHR, loading } = useAuth();

  if (loading) {
    return (
      <div className="page-loader">
        <LoaderCircle className="spin" size={30} />
        <span>Поднимаем рабочее место PulseHR...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (hrOnly && !isHR) {
    return <Navigate to="/surveys" replace />;
  }

  return <Outlet />;
}

function AppLayout() {
  const { user, isHR, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const navItems = isHR ? HR_NAV : EMPLOYEE_NAV;

  return (
    <div className="app-shell">
      <aside className="app-rail">
        <div className="app-brand">
          <div className="app-brand__logo">PH</div>
          <div>
            <span className="app-brand__company">СКС Ломбард</span>
            <strong>PulseHR</strong>
          </div>
        </div>

        <nav className="app-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `app-nav__link ${isActive ? 'app-nav__link--active' : ''}`
              }
            >
              <item.icon size={18} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="app-rail__footer">
          <div className="user-mini">
            <div className="user-mini__avatar">{getDisplayName(user).charAt(0)}</div>
            <div>
              <strong>{getDisplayName(user)}</strong>
              <span>{isHR ? 'HR-панель' : 'Сотрудник'}</span>
            </div>
          </div>
          <Button
            variant="ghost"
            icon={LogOut}
            onClick={() => {
              logout();
              navigate('/login');
            }}
          >
            Выйти
          </Button>
        </div>
      </aside>

      <main className="app-main">
        <header className="app-header">
          <div>
            <span className="page-path">{location.pathname}</span>
            <h1>
              {isHR ? 'Панель управления обратной связью' : 'Ваши опросы и уведомления'}
            </h1>
          </div>
          <div className="header-utilities">
            <div className="header-badges">
            <span><Bell size={16} /> Каскадные уведомления</span>
            <span><ShieldCheck size={16} /> Конфиденциальность</span>
            </div>
            {isHR ? (
              <NavLink to="/builder">
                <Button icon={Plus}>Создать опрос</Button>
              </NavLink>
            ) : null}
          </div>
        </header>
        <Outlet />
      </main>
    </div>
  );
}

function DashboardPage() {
  const { error } = useToast();
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [surveys, setSurveys] = useState([]);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      try {
        const [overview, surveyList] = await Promise.all([
          analyticsAPI.dashboard(),
          surveysAPI.list({ per_page: 6 }),
        ]);

        if (!active) {
          return;
        }

        setDashboard(overview);
        setSurveys(surveyList.items || []);
      } catch (loadError) {
        if (active) {
          error(loadError.message || 'Не удалось загрузить аналитику.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [error]);

  if (loading) {
    return <PageLoader label="Собираем HR-аналитику..." />;
  }

  const metrics = dashboard?.notification_metrics || {};
  const totalEmployees = dashboard?.total_employees || 0;

  return (
    <div className="page-stack">
      <section className="hero-board">
        <div className="hero-board__content">
          <span className="hero-board__eyebrow">Сводка на сегодня</span>
          <h2>Опросы уже работают, теперь осталось только усилить охват.</h2>
          <p>
            PulseHR собрал в одном экране статусы кампаний, проходимость, eNPS и
            метрики каскадной доставки через Push, SMS и дополнительные каналы.
          </p>
          <NavLink to="/builder" className="hero-board__cta">
            <Button icon={Plus}>Создать опрос</Button>
          </NavLink>
        </div>
        <div className="hero-board__progress">
          <CircularProgress
            value={dashboard?.average_completion_rate || 0}
            size={148}
            label="Средняя проходимость"
          />
        </div>
      </section>

      <section className="metric-grid">
        <StatsCard
          title="Всего опросов"
          value={dashboard?.total_surveys || 0}
          subtitle="за всё время"
          icon={MessageSquareQuote}
          color="primary"
        />
        <StatsCard
          title="Активных сейчас"
          value={dashboard?.active_surveys || 0}
          subtitle="в работе"
          icon={Sparkles}
          color="success"
        />
        <StatsCard
          title="Ответов собрано"
          value={dashboard?.total_responses || 0}
          subtitle="в базе"
          icon={ChartColumn}
          color="warning"
        />
        <StatsCard
          title="Сотрудников"
          value={totalEmployees}
          subtitle="в целевой аудитории"
          icon={Users}
          color="danger"
        />
      </section>

      <section className="dashboard-columns">
        <div className="panel">
          <div className="panel__header">
            <div>
              <span className="panel__eyebrow">Свежие кампании</span>
              <h3>Последние опросы</h3>
            </div>
            <NavLink className="inline-link" to="/surveys">
              Все опросы
            </NavLink>
          </div>

          <div className="survey-grid">
            {surveys.map((survey) => (
              <SurveyCard
                key={survey.id}
                survey={toSurveyCard(survey, 'hr', totalEmployees)}
                variant="hr"
                actionLabel="Открыть"
                onAction={() => navigate(`/surveys/${survey.id}`)}
              />
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel__header">
            <div>
              <span className="panel__eyebrow">Доставка уведомлений</span>
              <h3>Каскад каналов</h3>
            </div>
          </div>

          <div className="channel-stats">
            <MetricLine label="Отправлено" value={metrics.total_sent || 0} />
            <MetricLine label="Доставлено" value={formatPercent(metrics.delivery_rate)} />
            <MetricLine label="Открыто" value={formatPercent(metrics.open_rate)} />
            <MetricLine label="Переходы" value={formatPercent(metrics.click_rate)} />
            <MetricLine label="Стоимость SMS" value={`${metrics.total_cost || 0} ₽`} />
          </div>

          <div className="channel-cards">
            {Object.entries(metrics.by_channel || {}).map(([channel, value]) => (
              <div key={channel} className="channel-card">
                <strong className="channel-card__name">{getChannelLabel(channel)}</strong>
                <div className="channel-card__metric">
                  <span>Отправлено</span>
                  <strong>{value.sent || 0}</strong>
                </div>
                <div className="channel-card__metric">
                  <span>Открыто</span>
                  <strong>{value.opened || 0}</strong>
                </div>
                <div className="channel-card__metric">
                  <span>Переходы</span>
                  <strong>{value.clicked || 0}</strong>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function SurveysPage() {
  const { isHR } = useAuth();
  const { error } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [surveys, setSurveys] = useState([]);
  const [stats, setStats] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      try {
        const requests = isHR
          ? [surveysAPI.list({ per_page: 50, status: statusFilter || undefined }), analyticsAPI.dashboard()]
          : [surveysAPI.available({ per_page: 50 })];

        const [surveyList, dashboard] = await Promise.all(requests);
        if (!active) {
          return;
        }

        setSurveys(surveyList.items || []);
        setStats(dashboard || null);
      } catch (loadError) {
        if (active) {
          error(loadError.message || 'Не удалось загрузить список опросов.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [error, isHR, statusFilter]);

  if (loading) {
    return <PageLoader label="Подтягиваем опросы..." />;
  }

  return (
    <div className="page-stack">
      <section className="panel panel--soft">
        <div className="section-header">
          <div>
            <span className="panel__eyebrow">
              {isHR ? 'Управление кампаниями' : 'Доступные задачи'}
            </span>
            <h2>{isHR ? 'Все опросы PulseHR' : 'Опросы, которые ждут вашего ответа'}</h2>
          </div>
          {isHR ? (
            <NavLink to="/builder">
              <Button icon={Plus}>Создать опрос</Button>
            </NavLink>
          ) : null}
        </div>

        {isHR ? (
          <div className="chip-row">
            {[
              ['', 'Все'],
              ['draft', 'Черновики'],
              ['published', 'Опубликованные'],
              ['active', 'Активные'],
              ['closed', 'Завершённые'],
            ].map(([value, label]) => (
              <button
                key={label}
                type="button"
                className={`chip ${statusFilter === value ? 'chip--active' : ''}`}
                onClick={() => setStatusFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
      </section>

      <section className="survey-grid">
        {surveys.map((survey) => (
          <SurveyCard
            key={survey.id}
            survey={toSurveyCard(survey, isHR ? 'hr' : 'employee', stats?.total_employees || 0)}
            variant={isHR ? 'hr' : 'employee'}
            showProgress={isHR}
            actionLabel={isHR && canOpenBuilderForSurvey(survey) ? 'Конструктор' : 'Открыть'}
            onAction={(surveyId) =>
              navigate(
                isHR && canOpenBuilderForSurvey(survey)
                  ? `/builder?survey=${surveyId}`
                  : `/surveys/${surveyId}`,
              )
            }
          />
        ))}
      </section>

      {!surveys.length ? (
        <EmptyState
          title="Пока пусто"
          description={
            isHR
              ? 'Создайте первый опрос в конструкторе, чтобы запустить Pulse-мониторинг.'
              : 'Новых опросов сейчас нет. Как только HR опубликует кампанию, она появится здесь.'
          }
        />
      ) : null}
    </div>
  );
}

function SurveyDetailPage() {
  const { surveyId } = useParams();
  const numericSurveyId = Number(surveyId);
  const { isHR } = useAuth();
  const { success, error } = useToast();
  const navigate = useNavigate();
  const [survey, setSurvey] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [responses, setResponses] = useState([]);
  const [answers, setAnswers] = useState({});
  const [currentQuestionId, setCurrentQuestionId] = useState(null);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      try {
        const surveyResponse = await surveysAPI.get(numericSurveyId);
        if (!active) {
          return;
        }

        setSurvey(surveyResponse);
        const ordered = getOrderedQuestions(surveyResponse);
        setCurrentQuestionId(ordered[0]?.id || null);

        if (isHR) {
          const [analyticsResponse, responseList] = await Promise.all([
            analyticsAPI.survey(numericSurveyId).catch(() => null),
            responsesAPI.list(numericSurveyId).catch(() => []),
          ]);

          if (!active) {
            return;
          }

          setAnalytics(analyticsResponse);
          setResponses(responseList || []);
        } else {
          const myResponse = await responsesAPI.myResponse(numericSurveyId).catch(() => null);
          if (myResponse && active) {
            const mapped = {};
            (myResponse.answers || []).forEach((item) => {
              mapped[item.question_id] = item.value;
            });
            setAnswers(mapped);
            setAlreadySubmitted(true);
          }
        }
      } catch (loadError) {
        if (active) {
          error(loadError.message || 'Не удалось открыть опрос.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [error, isHR, numericSurveyId]);

  if (loading) {
    return <PageLoader label="Открываем детали опроса..." />;
  }

  if (!survey) {
    return <EmptyState title="Опрос не найден" description="Проверьте ссылку или вернитесь к списку." />;
  }

  const orderedQuestions = getOrderedQuestions(survey);
  const visibleQuestions = getVisibleQuestions(orderedQuestions, answers);
  const currentQuestion =
    visibleQuestions.find((item) => item.id === currentQuestionId) || visibleQuestions[0];
  const currentIndex = visibleQuestions.findIndex((item) => item.id === currentQuestion?.id);
  const progress = visibleQuestions.length
    ? Math.round(((currentIndex + 1) / visibleQuestions.length) * 100)
    : 0;
  const status = normalizeStatus(survey.status);

  async function submitSurvey() {
    const missing = visibleQuestions.find(
      (question) => question.required && !isAnswerFilled(question.type, answers[question.id]),
    );

    if (missing) {
      error('Заполните обязательные вопросы перед отправкой.');
      setCurrentQuestionId(missing.id);
      return;
    }

    setSubmitting(true);

    try {
      const payload = visibleQuestions
        .filter((question) => isAnswerFilled(question.type, answers[question.id]))
        .map((question) => ({
          question_id: question.id,
          value: answers[question.id],
        }));

      await responsesAPI.submit(numericSurveyId, payload);
      setAlreadySubmitted(true);
      success('Ответы отправлены. Спасибо за участие.');
    } catch (submitError) {
      error(submitError.message || 'Не удалось отправить ответы.');
    } finally {
      setSubmitting(false);
    }
  }

  function goNext() {
    if (currentQuestion.required && !isAnswerFilled(currentQuestion.type, answers[currentQuestion.id])) {
      error('Ответьте на обязательный вопрос, чтобы продолжить.');
      return;
    }

    const target = getNextQuestionId(currentQuestion, answers, orderedQuestions, visibleQuestions);
    if (!target) {
      submitSurvey();
      return;
    }

    setCurrentQuestionId(target);
  }

  async function handleExport(format = 'xlsx') {
    setExporting(true);

    try {
      await analyticsAPI.exportFile(numericSurveyId, format);
      success('Экспорт подготовлен и скачивается.');
    } catch (exportError) {
      error(exportError.message || 'Не удалось выгрузить ответы.');
    } finally {
      setExporting(false);
    }
  }

  if (isHR) {
    return (
      <div className="page-stack">
        <section className="panel panel--hero">
          <div className="section-header">
            <div>
              <span className="panel__eyebrow">{status.label}</span>
              <h2>{survey.title}</h2>
              <p>{survey.description || 'Описание не добавлено.'}</p>
            </div>
            <div className="header-actions">
              <Button
                variant="secondary"
                icon={FileSpreadsheet}
                loading={exporting}
                onClick={() => handleExport('xlsx')}
              >
                Экспорт XLSX
              </Button>
              {canOpenBuilderForSurvey(survey) ? (
                <NavLink to={`/builder?survey=${numericSurveyId}`}>
                  <Button icon={BrainCircuit}>Открыть конструктор</Button>
                </NavLink>
              ) : null}
            </div>
          </div>
        </section>

        <section className="dashboard-columns">
          <div className="panel">
            <div className="panel__header">
              <div>
                <span className="panel__eyebrow">Состав опроса</span>
                <h3>Вопросы</h3>
              </div>
            </div>
            <div className="question-list">
              {orderedQuestions.map((question, index) => (
                <div key={question.id} className="question-list__item">
                  <div className="question-list__index">{index + 1}</div>
                  <div>
                    <strong>{question.text}</strong>
                    <p>
                      {question.type === 'scale' ? 'Шкала / eNPS' : question.type}
                      {isBranchOnlyQuestion(question) ? ' · Только по ветке' : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel__header">
              <div>
                <span className="panel__eyebrow">Результаты</span>
                <h3>Быстрая аналитика</h3>
              </div>
            </div>
            {analytics ? (
              <div className="channel-stats">
                <MetricLine label="Приглашено" value={analytics.total_invited} />
                <MetricLine label="Ответили" value={analytics.total_responses} />
                <MetricLine label="Проходимость" value={formatPercent(analytics.completion_rate)} />
                <MetricLine label="eNPS" value={analytics.enps?.score ?? '—'} />
              </div>
            ) : (
              <EmptyState title="Аналитика пока не готова" description="Появится после первых ответов." compact />
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel__header">
            <div>
              <span className="panel__eyebrow">Последние ответы</span>
              <h3>Журнал прохождения</h3>
            </div>
          </div>
          <div className="history-list">
            {responses.map((item) => (
              <div key={item.id} className="history-item">
                <div>
                  <strong>{item.user_name || item.user_department || 'Анонимный участник'}</strong>
                  <p>{formatDateTime(item.completed_at)}</p>
                </div>
                <span>{item.answers_count} ответов</span>
              </div>
            ))}
            {!responses.length ? (
              <EmptyState title="Ответов ещё нет" description="Как только сотрудники начнут проходить опрос, записи появятся здесь." compact />
            ) : null}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <section className="panel panel--hero">
        <div className="section-header">
          <div>
            <span className="panel__eyebrow">{status.label}</span>
            <h2>{survey.title}</h2>
            <p>{survey.description || 'Поделитесь обратной связью по нескольким коротким вопросам.'}</p>
          </div>
          <div className="survey-meta">
            <span><Clock3 size={16} /> ~{survey.estimated_minutes} мин</span>
            <span><CalendarDays size={16} /> до {formatDate(survey.ends_at)}</span>
          </div>
        </div>
      </section>

      {String(survey.anonymity).toLowerCase() !== 'none' ? (
        <div className="privacy-banner">
          <ShieldCheck size={18} />
          <span>
            {String(survey.anonymity).toLowerCase() === 'full'
              ? 'Опрос полностью анонимный: ответы не связываются с вашей личностью.'
              : 'Опрос частично анонимный: HR увидит только агрегированные данные и контекст подразделения.'}
          </span>
        </div>
      ) : (
        <div className="privacy-banner privacy-banner--neutral">
          <ShieldCheck size={18} />
          <span>{getAnonymityDescription(survey.anonymity)}</span>
        </div>
      )}

      {alreadySubmitted ? (
        <section className="panel panel--center">
          <CheckCircle2 size={48} className="success-mark" />
          <h3>Опрос уже пройден</h3>
          <p>Ответы сохранены. Спасибо, что помогаете держать руку на пульсе команды.</p>
          <Button onClick={() => navigate('/surveys')} icon={ArrowRight}>
            Вернуться к списку
          </Button>
        </section>
      ) : currentQuestion ? (
        <section className="panel survey-player">
          <div className="survey-player__top">
            <div>
              <span className="panel__eyebrow">
                Вопрос {currentIndex + 1} из {visibleQuestions.length}
              </span>
              <h3>{currentQuestion.text}</h3>
            </div>
            <div className="survey-player__progress">
              <span>{formatPercent(progress)}</span>
              <ProgressBar value={progress} showPercent={false} />
            </div>
          </div>

          <QuestionRenderer
            question={currentQuestion}
            value={answers[currentQuestion.id]}
            onChange={(value) =>
              setAnswers((current) => ({
                ...current,
                [currentQuestion.id]: value,
              }))
            }
          />

          <div className="survey-player__actions">
            <Button
              variant="ghost"
              icon={ChevronLeft}
              disabled={currentIndex <= 0}
              onClick={() => setCurrentQuestionId(visibleQuestions[currentIndex - 1]?.id || currentQuestion.id)}
            >
              Назад
            </Button>
            <Button loading={submitting} iconRight={ChevronRight} onClick={goNext}>
              {currentIndex === visibleQuestions.length - 1 ? 'Отправить' : 'Далее'}
            </Button>
          </div>
        </section>
      ) : (
        <EmptyState title="В опросе пока нет вопросов" description="HR ещё не наполнил этот шаблон." />
      )}
    </div>
  );
}

function ProfilePage() {
  const { user } = useAuth();
  const { success, error, info } = useToast();
  const {
    isSupported,
    isSubscribed,
    loading: pushLoading,
    permission,
    subscribe,
    unsubscribe,
  } = usePush();
  const [profile, setProfile] = useState(user || {});
  const [preferences, setPreferences] = useState(null);
  const [history, setHistory] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const [profileResponse, preferencesResponse, historyResponse, subscriptionResponse] =
        await Promise.all([
          usersAPI.me(),
          notificationsAPI.getPreferences().catch(() => null),
          notificationsAPI.history({ per_page: 12 }).catch(() => ({ items: [] })),
          notificationsAPI.listSubscriptions().catch(() => []),
        ]);

      setProfile(profileResponse || {});
      setPreferences(preferencesResponse);
      setHistory(historyResponse.items || []);
      setSubscriptions(subscriptionResponse || []);
    } catch (loadError) {
      error(loadError.message || 'Не удалось открыть профиль.');
    } finally {
      setLoading(false);
    }
  }, [error]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  async function saveProfile(event) {
    event.preventDefault();
    setSaving(true);

    try {
      const updated = await usersAPI.updateMe({
        name: profile.name,
        department: profile.department,
        position: profile.position,
        city: profile.city,
        timezone: profile.timezone,
        consent_notifications: profile.consent_notifications,
        dnd_mode: profile.dnd_mode,
      });
      setProfile(updated);
      success('Профиль обновлён.');
    } catch (saveError) {
      error(saveError.message || 'Не удалось сохранить профиль.');
    } finally {
      setSaving(false);
    }
  }

  async function togglePreference(key, value) {
    try {
      const updated = await notificationsAPI.updatePreferences({ [key]: !value });
      setPreferences(updated);
      success('Настройки уведомлений обновлены.');
    } catch (updateError) {
      error(updateError.message || 'Не удалось обновить настройку.');
    }
  }

  async function handlePushToggle() {
    if (isSubscribed) {
      const result = await unsubscribe();
      if (result) {
        info('Push-подписка отключена.');
        setSubscriptions((current) => current.slice(1));
      } else {
        error('Не удалось отключить push.');
      }
      return;
    }

    const result = await subscribe();
    if (result) {
      success('Push-подписка активирована.');
      loadProfile();
    } else {
      error('Не удалось включить push на этом устройстве.');
    }
  }

  if (loading) {
    return <PageLoader label="Открываем профиль и уведомления..." />;
  }

  const preferenceFlags = Object.entries(preferences || {}).filter(
    ([key, value]) =>
      typeof value === 'boolean' &&
      !['id', 'user_id'].includes(key),
  );
  const localizedHistory = history.map((item) => ({
    ...item,
    title: item.title || getChannelLabel(item.channel) || 'Уведомление',
    body: item.body || getNotificationStatusLabel(item.status) || 'Событие зафиксировано в журнале',
  }));

  return (
    <div className="page-stack">
      <section className="dashboard-columns">
        <form className="panel" onSubmit={saveProfile}>
          <div className="panel__header">
            <div>
              <span className="panel__eyebrow">Личный кабинет</span>
              <h3>Профиль сотрудника</h3>
            </div>
          </div>

          <div className="form-grid">
            <Input
              label="Имя"
              value={profile?.name || ''}
              onChange={(event) =>
                setProfile((current) => ({ ...current, name: event.target.value }))
              }
              fullWidth
            />
            <Input
              label="Подразделение"
              value={profile?.department || ''}
              onChange={(event) =>
                setProfile((current) => ({ ...current, department: event.target.value }))
              }
              fullWidth
            />
            <Input
              label="Должность"
              value={profile?.position || ''}
              onChange={(event) =>
                setProfile((current) => ({ ...current, position: event.target.value }))
              }
              fullWidth
            />
            <Input
              label="Город"
              value={profile?.city || ''}
              onChange={(event) =>
                setProfile((current) => ({ ...current, city: event.target.value }))
              }
              fullWidth
            />
            <Input
              label="Часовой пояс"
              value={profile?.timezone || ''}
              onChange={(event) =>
                setProfile((current) => ({ ...current, timezone: event.target.value }))
              }
              fullWidth
            />
            <label className="field field--checkbox">
              <input
                type="checkbox"
                checked={Boolean(profile?.consent_notifications)}
                onChange={(event) =>
                  setProfile((current) => ({
                    ...current,
                    consent_notifications: event.target.checked,
                  }))
                }
              />
              <span>Согласен получать коммуникации</span>
            </label>
            <label className="field field--checkbox">
              <input
                type="checkbox"
                checked={Boolean(profile?.dnd_mode)}
                onChange={(event) =>
                  setProfile((current) => ({ ...current, dnd_mode: event.target.checked }))
                }
              />
              <span>Не беспокоить</span>
            </label>
            <Button type="submit" loading={saving} icon={BadgeCheck}>
              Сохранить профиль
            </Button>
          </div>
        </form>

        <div className="panel">
          <div className="panel__header">
            <div>
              <span className="panel__eyebrow">Push и устройства</span>
              <h3>Каналы доставки</h3>
            </div>
          </div>
          <div className="device-card">
            <div>
              <strong>Веб-пуш</strong>
              <p>
                {isSupported
                  ? `Разрешение браузера: ${permission}.`
                  : 'Этот браузер не поддерживает web push.'}
              </p>
            </div>
            <Button loading={pushLoading} onClick={handlePushToggle} icon={Smartphone}>
              {isSubscribed ? 'Отключить push' : 'Включить push'}
            </Button>
          </div>

          <div className="device-list">
            {subscriptions.map((item) => (
              <div key={item.id} className="device-list__item">
                <div>
                  <strong>{item.device_name || 'Устройство браузера'}</strong>
                  <p>Последняя активность: {formatDateTime(item.last_used_at || item.created_at)}</p>
                </div>
                <button
                  type="button"
                  className="link-danger"
                  onClick={async () => {
                    try {
                      await notificationsAPI.removeSubscription(item.id);
                      setSubscriptions((current) => current.filter((entry) => entry.id !== item.id));
                      success('Устройство удалено из списка подписок.');
                    } catch (removeError) {
                      error(removeError.message || 'Не удалось удалить устройство.');
                    }
                  }}
                >
                  Удалить
                </button>
              </div>
            ))}
            {!subscriptions.length ? (
              <EmptyState title="Подписок пока нет" description="После включения push текущее устройство появится здесь." compact />
            ) : null}
          </div>
        </div>
      </section>

      <section className="dashboard-columns">
        <div className="panel">
          <div className="panel__header">
            <div>
              <span className="panel__eyebrow">Предпочтения</span>
              <h3>Настройки уведомлений</h3>
            </div>
          </div>
          <div className="settings-list">
            {preferenceFlags.map(([key, value]) => (
              <button
                key={key}
                type="button"
                className="settings-row"
                onClick={() => togglePreference(key, value)}
              >
                <span>{getPreferenceLabel(key)}</span>
                <strong>{value ? 'Вкл' : 'Выкл'}</strong>
              </button>
            ))}
            {!preferenceFlags.length ? (
              <EmptyState title="Настройки по умолчанию" description="Бэкенд вернул пустую конфигурацию, но канал уже готов к работе." compact />
            ) : null}
          </div>
        </div>

        <div className="panel">
          <div className="panel__header">
            <div>
              <span className="panel__eyebrow">История</span>
              <h3>Последние уведомления</h3>
            </div>
          </div>
          <div className="history-list">
            {localizedHistory.map((item) => (
              <div key={item.id} className="history-item">
                <div>
                  <strong>{item.title || item.channel || 'Уведомление'}</strong>
                  <p>{item.body || item.status || 'Событие зафиксировано в журнале'}</p>
                </div>
                <span>{formatDateTime(item.created_at)}</span>
              </div>
            ))}
            {!history.length ? (
              <EmptyState title="История пока пуста" description="После первой публикации уведомления появятся здесь." compact />
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

function HomeRedirect() {
  const { isHR } = useAuth();
  return <Navigate to={isHR ? '/dashboard' : '/surveys'} replace />;
}

function PageLoader({ label, compact = false }) {
  return (
    <div className={`page-loader ${compact ? 'page-loader--compact' : ''}`}>
      <LoaderCircle className="spin" size={26} />
      <span>{label}</span>
    </div>
  );
}

function EmptyState({ title, description, compact = false }) {
  return (
    <div className={`empty-state ${compact ? 'empty-state--compact' : ''}`}>
      <CircleDashed size={compact ? 22 : 32} />
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

function MetricLine({ label, value }) {
  return (
    <div className="metric-line">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<HomeRedirect />} />
          <Route path="/surveys" element={<SurveysPage />} />
          <Route path="/surveys/:surveyId" element={<SurveyDetailPage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute hrOnly />}>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/builder" element={<VisualBuilderPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
