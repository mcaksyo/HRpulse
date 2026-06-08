import {
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext(null);

const PHONE_ALIASES = {
  '+79991234567': '+79001234567',
  '+79997654321': '+79001234568',
};

const DEMO_USERS = {
  '+79001234567': {
    id: 1,
    phone: '+79001234567',
    name: 'Анна Петрова',
    role: 'hr',
    department: 'HR',
    position: 'HR-менеджер',
    city: 'Екатеринбург',
    timezone: 'Asia/Yekaterinburg',
    consent_notifications: true,
    dnd_mode: false,
    created_at: new Date().toISOString(),
  },
  '+79001234568': {
    id: 2,
    phone: '+79001234568',
    name: 'Иван Сидоров',
    role: 'employee',
    department: 'Розница',
    position: 'Товаровед',
    city: 'Тюмень',
    timezone: 'Asia/Yekaterinburg',
    consent_notifications: true,
    dnd_mode: false,
    created_at: new Date().toISOString(),
  },
};

function isNetworkFailure(error) {
  if (error instanceof TypeError) {
    return true;
  }

  const message = String(error?.message || '');
  return /Failed to fetch|NetworkError|Load failed/i.test(message);
}

function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) {
    return '';
  }

  const tail = digits.length >= 10 ? digits.slice(-10) : digits;
  const normalized = `+7${tail}`;
  return PHONE_ALIASES[normalized] || normalized;
}

function saveSession(token, user) {
  localStorage.setItem('pulsehr_token', token);
  localStorage.setItem('pulsehr_user', JSON.stringify(user));
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('pulsehr_user');
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw);
    } catch {
      localStorage.removeItem('pulsehr_user');
      return null;
    }
  });
  const [token, setToken] = useState(() => localStorage.getItem('pulsehr_token'));
  const [loading, setLoading] = useState(Boolean(localStorage.getItem('pulsehr_token')));

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      if (!token) {
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const profile = await authAPI.me();
        if (cancelled) {
          return;
        }

        setUser(profile);
        localStorage.setItem('pulsehr_user', JSON.stringify(profile));
      } catch {
        if (cancelled) {
          return;
        }

        localStorage.removeItem('pulsehr_token');
        localStorage.removeItem('pulsehr_user');
        setToken(null);
        setUser(null);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    restoreSession();

    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    const handleUnauthorized = () => {
      localStorage.removeItem('pulsehr_token');
      localStorage.removeItem('pulsehr_user');
      setToken(null);
      setUser(null);
    };

    window.addEventListener('pulsehr:unauthorized', handleUnauthorized);
    return () =>
      window.removeEventListener('pulsehr:unauthorized', handleUnauthorized);
  }, []);

  async function sendOTP(phone) {
    try {
      const payload = await authAPI.sendOTP(normalizePhone(phone));
      return { success: true, debugCode: payload?.debug_code };
    } catch (error) {
      if (!isNetworkFailure(error)) {
        return {
          success: false,
          error: error.message || 'Не удалось отправить код.',
        };
      }

      return {
        success: true,
        debugCode: '123456',
        warning:
          error.message ||
          'Бэкенд недоступен, включён демонстрационный режим с кодом 123456.',
      };
    }
  }

  async function verifyOTP(phone, code) {
    const normalizedPhone = normalizePhone(phone);

    try {
      const payload = await authAPI.verifyOTP(normalizedPhone, code);
      saveSession(payload.access_token, payload.user);
      setToken(payload.access_token);
      setUser(payload.user);
      return { success: true, user: payload.user };
    } catch (error) {
      if (code === '123456' && isNetworkFailure(error)) {
        const demoUser = DEMO_USERS[normalizedPhone] || DEMO_USERS['+79001234567'];
        const demoToken = `demo_${Date.now()}`;
        saveSession(demoToken, demoUser);
        setToken(demoToken);
        setUser(demoUser);
        return { success: true, user: demoUser, demoMode: true };
      }

      return {
        success: false,
        error: error.message || 'Не удалось подтвердить код.',
      };
    }
  }

  function logout() {
    localStorage.removeItem('pulsehr_token');
    localStorage.removeItem('pulsehr_user');
    setToken(null);
    setUser(null);
  }

  const role = typeof user?.role === 'string' ? user.role.toLowerCase() : '';
  const value = {
    user,
    token,
    loading,
    isAuthenticated: Boolean(user && token),
    isHR: role === 'hr',
    sendOTP,
    verifyOTP,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
}

export default useAuth;
