const API_ROOT =
  import.meta.env.VITE_API_URL?.replace(/\/$/, '') ||
  'http://localhost:8000/api/v1';

const APP_ROOT = API_ROOT.replace(/\/api\/v1$/, '');

function getToken() {
  return localStorage.getItem('pulsehr_token');
}

function clearAuth() {
  localStorage.removeItem('pulsehr_token');
  localStorage.removeItem('pulsehr_user');
  window.dispatchEvent(new CustomEvent('pulsehr:unauthorized'));
}

function buildQuery(params) {
  if (!params) {
    return '';
  }

  const search = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => search.append(key, item));
      return;
    }

    search.append(key, value);
  });

  const query = search.toString();
  return query ? `?${query}` : '';
}

async function parseResponse(response) {
  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }

  return response.text();
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = {
    ...options.headers,
  };

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const config = {
    method: 'GET',
    ...options,
    headers,
  };

  if (
    config.body &&
    typeof config.body === 'object' &&
    !(config.body instanceof FormData)
  ) {
    config.body = JSON.stringify(config.body);
  }

  const response = await fetch(`${API_ROOT}${path}`, config);

  if (response.status === 401) {
    clearAuth();
    throw new Error('Сессия истекла. Войдите снова.');
  }

  if (!response.ok) {
    const data = await parseResponse(response).catch(() => null);
    const detail =
      typeof data === 'string'
        ? data
        : data?.detail || data?.message || `HTTP ${response.status}`;
    throw new Error(detail);
  }

  return parseResponse(response);
}

async function download(path, { filename } = {}) {
  const token = getToken();
  const headers = {};

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_ROOT}${path}`, {
    method: 'GET',
    headers,
  });

  if (response.status === 401) {
    clearAuth();
    throw new Error('Сессия истекла. Войдите снова.');
  }

  if (!response.ok) {
    const data = await parseResponse(response).catch(() => null);
    const detail =
      typeof data === 'string'
        ? data
        : data?.detail || data?.message || `HTTP ${response.status}`;
    throw new Error(detail);
  }

  const blob = await response.blob();
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  const disposition = response.headers.get('content-disposition') || '';
  const matchedFilename = disposition.match(/filename=([^;]+)/i)?.[1]?.replaceAll('"', '');

  link.href = objectUrl;
  link.download = matchedFilename || filename || 'export.xlsx';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(objectUrl);
}

export const authAPI = {
  sendOTP: (phone) =>
    request('/auth/send-otp', {
      method: 'POST',
      body: { phone },
    }),
  verifyOTP: (phone, code) =>
    request('/auth/verify-otp', {
      method: 'POST',
      body: { phone, code },
    }),
  me: () => request('/auth/me'),
};

export const surveysAPI = {
  list: (params) => request(`/surveys${buildQuery(params)}`),
  available: (params) => request(`/surveys/available${buildQuery(params)}`),
  get: (surveyId) => request(`/surveys/${surveyId}`),
  create: (data) =>
    request('/surveys/', {
      method: 'POST',
      body: data,
    }),
  update: (surveyId, data) =>
    request(`/surveys/${surveyId}`, {
      method: 'PUT',
      body: data,
    }),
  remove: (surveyId) =>
    request(`/surveys/${surveyId}`, {
      method: 'DELETE',
    }),
  publish: (surveyId) =>
    request(`/surveys/${surveyId}/publish`, {
      method: 'POST',
    }),
  close: (surveyId) =>
    request(`/surveys/${surveyId}/close`, {
      method: 'POST',
    }),
};

export const questionsAPI = {
  list: (surveyId) => request(`/surveys/${surveyId}/questions/`),
  create: (surveyId, data) =>
    request(`/surveys/${surveyId}/questions/`, {
      method: 'POST',
      body: data,
    }),
  update: (surveyId, questionId, data) =>
    request(`/surveys/${surveyId}/questions/${questionId}`, {
      method: 'PUT',
      body: data,
    }),
  remove: (surveyId, questionId) =>
    request(`/surveys/${surveyId}/questions/${questionId}`, {
      method: 'DELETE',
    }),
  reorder: (surveyId, questionIds) =>
    request(`/surveys/${surveyId}/questions/reorder`, {
      method: 'POST',
      body: { question_ids: questionIds },
    }),
};

export const responsesAPI = {
  submit: (surveyId, answers) =>
    request(`/surveys/${surveyId}/respond`, {
      method: 'POST',
      body: { answers },
    }),
  myResponse: (surveyId) => request(`/surveys/${surveyId}/my-response`),
  list: (surveyId) => request(`/surveys/${surveyId}/responses`),
};

export const analyticsAPI = {
  dashboard: () => request('/analytics/dashboard'),
  survey: (surveyId) => request(`/analytics/surveys/${surveyId}`),
  exportUrl: (surveyId, format = 'xlsx') =>
    `${API_ROOT}/analytics/surveys/${surveyId}/export${buildQuery({ format })}`,
  exportFile: (surveyId, format = 'xlsx') =>
    download(`/analytics/surveys/${surveyId}/export${buildQuery({ format })}`, {
      filename: `survey_${surveyId}.${format}`,
    }),
};

export const notificationsAPI = {
  getPreferences: () => request('/notifications/preferences'),
  updatePreferences: (data) =>
    request('/notifications/preferences', {
      method: 'PUT',
      body: data,
    }),
  history: (params) => request(`/notifications/history${buildQuery(params)}`),
  markOpened: (notificationId) =>
    request(`/notifications/${notificationId}/opened`, {
      method: 'POST',
    }),
  markClicked: (notificationId) =>
    request(`/notifications/${notificationId}/clicked`, {
      method: 'POST',
    }),
  subscribePush: (data) =>
    request('/notifications/push/subscribe', {
      method: 'POST',
      body: data,
    }),
  listSubscriptions: () => request('/notifications/push/subscriptions'),
  removeSubscription: (subscriptionId) =>
    request(`/notifications/push/subscriptions/${subscriptionId}`, {
      method: 'DELETE',
    }),
};

export const usersAPI = {
  me: () => request('/users/me'),
  updateMe: (data) =>
    request('/users/me', {
      method: 'PUT',
      body: data,
    }),
  list: (params) => request(`/users/${buildQuery(params)}`),
};

export const systemAPI = {
  health: () => fetch(`${APP_ROOT}/health`).then((response) => response.json()),
  vapidPublicKey: () =>
    fetch(`${API_ROOT}/vapid-public-key`).then((response) => response.json()),
};

export { API_ROOT, APP_ROOT, buildQuery, clearAuth };

export default request;
