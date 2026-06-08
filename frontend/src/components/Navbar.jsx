import './Navbar.css';
import { NavLink, useNavigate } from 'react-router-dom';
import { Bell, User, LogOut, Activity, ChevronDown } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useState, useRef, useEffect } from 'react';

export default function Navbar() {
  const { user, isHR, logout } = useAuth();
  const navigate = useNavigate();
  const [showDropdown, setShowDropdown] = useState(false);
  const [notifCount] = useState(3);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="navbar">
      <div className="navbar__inner">
        {/* Left: Brand */}
        <div className="navbar__brand">
          <NavLink to="/" className="navbar__logo-link">
            <div className="navbar__logo-icon">
              <Activity size={22} />
            </div>
            <div className="navbar__logo-text">
              <span className="navbar__company">СКС ЛОМБАРД</span>
              <span className="navbar__app-name">PulseHR</span>
            </div>
          </NavLink>
        </div>

        {/* Center: Nav Links */}
        <nav className="navbar__nav">
          <NavLink to={isHR ? '/dashboard' : '/surveys'} className={({ isActive }) => `navbar__link ${isActive ? 'navbar__link--active' : ''}`}>
            Главная
          </NavLink>
          <NavLink to="/surveys" className={({ isActive }) => `navbar__link ${isActive ? 'navbar__link--active' : ''}`}>
            Опросы
          </NavLink>
          {isHR && (
            <NavLink to="/dashboard" className={({ isActive }) => `navbar__link ${isActive ? 'navbar__link--active' : ''}`}>
              Аналитика
            </NavLink>
          )}
          <NavLink to="/profile" className={({ isActive }) => `navbar__link ${isActive ? 'navbar__link--active' : ''}`}>
            <span className="navbar__link-bell-wrap">
              <Bell size={16} />
              {notifCount > 0 && <span className="navbar__notif-badge">{notifCount}</span>}
            </span>
            Уведомления
          </NavLink>
          <NavLink to="/profile" className={({ isActive }) => `navbar__link ${isActive ? 'navbar__link--active' : ''}`} end>
            Профиль
          </NavLink>
        </nav>

        {/* Right: User */}
        <div className="navbar__user" ref={dropdownRef}>
          <button className="navbar__user-btn" onClick={() => setShowDropdown(!showDropdown)}>
            <div className="navbar__avatar">
              {user?.first_name?.[0]}{user?.last_name?.[0]}
            </div>
            <span className="navbar__user-name">{user?.first_name} {user?.last_name}</span>
            <ChevronDown size={16} className={`navbar__chevron ${showDropdown ? 'navbar__chevron--open' : ''}`} />
          </button>

          {showDropdown && (
            <div className="navbar__dropdown">
              <div className="navbar__dropdown-header">
                <div className="navbar__dropdown-avatar">
                  {user?.first_name?.[0]}{user?.last_name?.[0]}
                </div>
                <div>
                  <div className="navbar__dropdown-name">{user?.first_name} {user?.last_name}</div>
                  <div className="navbar__dropdown-role">{isHR ? 'HR-специалист' : 'Сотрудник'}</div>
                </div>
              </div>
              <div className="navbar__dropdown-divider" />
              <button className="navbar__dropdown-item" onClick={() => { navigate('/profile'); setShowDropdown(false); }}>
                <User size={16} />
                Профиль
              </button>
              <button className="navbar__dropdown-item navbar__dropdown-item--danger" onClick={handleLogout}>
                <LogOut size={16} />
                Выйти
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
