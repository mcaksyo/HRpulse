import { useState, useCallback } from 'react';

const BASE_URL = 'http://localhost:8000/api/v1';

export function useApi() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const request = useCallback(async (endpoint, options = {}) => {
    setLoading(true);
    setError(null);

    const token = localStorage.getItem('pulsehr_token');
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const config = {
      ...options,
      headers,
    };

    if (config.body && typeof config.body === 'object' && !(config.body instanceof FormData)) {
      config.body = JSON.stringify(config.body);
    }

    try {
      const response = await fetch(`${BASE_URL}${endpoint}`, config);

      if (response.status === 401) {
        localStorage.removeItem('pulsehr_token');
        localStorage.removeItem('pulsehr_user');
        window.location.href = '/login';
        throw new Error('Unauthorized');
      }

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || `Ошибка ${response.status}`);
      }

      if (response.status === 204) {
        setLoading(false);
        return null;
      }

      const data = await response.json();
      setLoading(false);
      return data;
    } catch (err) {
      setError(err.message);
      setLoading(false);
      throw err;
    }
  }, []);

  const get = useCallback((endpoint) => request(endpoint), [request]);
  const post = useCallback((endpoint, body) => request(endpoint, { method: 'POST', body }), [request]);
  const put = useCallback((endpoint, body) => request(endpoint, { method: 'PUT', body }), [request]);
  const del = useCallback((endpoint) => request(endpoint, { method: 'DELETE' }), [request]);

  return { request, get, post, put, del, loading, error };
}

export default useApi;
