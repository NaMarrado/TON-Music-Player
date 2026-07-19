import type { ReactNode } from 'react';
import { NavLink } from 'react-router';

export function SidebarNavItem({
  collapsed,
  icon,
  label,
  to,
  badge = false,
}: {
  collapsed: boolean;
  icon: ReactNode;
  label: string;
  to: string;
  badge?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      title={label}
      className="sidebar-nav-item flex items-center relative no-underline"
      style={({ isActive }) => ({
        padding: collapsed ? '10px 0' : '10px 12px',
        borderRadius: 'var(--radius)',
        color: isActive ? 'var(--white)' : 'var(--text-secondary)',
        fontWeight: 400,
        fontSize: '0.93rem',
        cursor: 'pointer',
        background: isActive ? 'var(--glow-strong)' : 'transparent',
        textDecoration: 'none',
        justifyContent: collapsed ? 'center' : 'flex-start',
        gap: collapsed ? 0 : '14px',
      })}
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span
              className="absolute left-0 top-1/2 -translate-y-1/2"
              style={{
                width: '3px',
                height: '20px',
                background: 'var(--white)',
                borderRadius: '0 2px 2px 0',
              }}
            />
          )}
          <span className="nav-icon w-5 h-5 shrink-0" style={{ opacity: isActive ? 1 : 0.7 }}>
            {icon}
            {badge && (
              <span
                aria-label="New update"
                style={{
                  alignItems: 'center',
                  background: '#ff3b3b',
                  border: '2px solid var(--bg-base)',
                  borderRadius: '50%',
                  color: '#fff',
                  display: 'flex',
                  fontSize: '7px',
                  fontWeight: 800,
                  height: '13px',
                  justifyContent: 'center',
                  position: 'absolute',
                  right: collapsed ? 'calc(50% - 14px)' : 'auto',
                  left: collapsed ? 'auto' : '25px',
                  top: '5px',
                  width: '13px',
                }}
              >!</span>
            )}
          </span>
          {!collapsed && <span>{label}</span>}
        </>
      )}
    </NavLink>
  );
}
