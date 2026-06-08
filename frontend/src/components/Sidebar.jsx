import './Sidebar.css';
import { NavLink } from 'react-router-dom';
import { Activity, ClipboardList, BarChart3, Bell, Shield, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';

const NAV_ITEMS_HR = [
  { path: '/surveys', icon: ClipboardList, label: 'Опросы сотрудников' },
  { path: '/dashboard', icon: BarChart3, label: 'Аналитика и отчёты' },
  { path: '/profile', icon: Bell, label: 'Уведомления' },
  { path: '/profile', icon: Shield, label: 'Конфиденциальность', end: true },
];

const NAV_ITEMS_EMPLOYEE = [
  { path: '/surveys', icon: ClipboardList, label: 'Мои опросы' },
  { path: '/profile', icon: Bell, label: 'Уведомления' },
  { path: '/profile', icon: Shield, label: 'Конфиденциальность', end: true },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const { isHR } = useAuth();
  const items = isHR ? NAV_ITEMS_HR : NAV_ITEMS_EMPLOYEE;

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''}`}>
      <div className="sidebar__header">
        <div className="sidebar__brand">
          <div className="sidebar__brand-icon">
            <Activity size={20} />
          </div>
          {!collapsed && (
            <div className="sidebar__brand-text">
              <span className="sidebar__brand-name">PulseHR</span>
              <span className="sidebar__brand-tagline">Пульс команды</span>
            </div>
          )}
        </div>
        <button
          className="sidebar__toggle"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? 'Развернуть' : 'Свернуть'}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      <nav className="sidebar__nav">
        {items.map((item) => (
          <NavLink
            key={item.label}
            to={item.path}
            end={item.end}
            className={({ isActive }) => `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`}
            title={collapsed ? item.label : undefined}
          >
            <item.icon size={20} className="sidebar__link-icon" />
            {!collapsed && <span className="sidebar__link-label">{item.label}</span>}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
