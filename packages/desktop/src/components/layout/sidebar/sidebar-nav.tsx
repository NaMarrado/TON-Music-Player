import {
  DownloadsIcon,
  HomeIcon,
  LibraryIcon,
  SearchIcon,
  SettingsIcon,
} from '../sidebar-icons';
import { SidebarNavItem } from './sidebar-nav-item';

export function SidebarNav({
  collapsed,
  t,
}: {
  collapsed: boolean;
  t: (key: string) => string;
}) {
  return (
    <nav
      className="flex shrink-0 flex-col"
      style={{
        gap: collapsed ? '8px' : '6px',
        padding: collapsed ? '8px 8px 16px' : '8px 12px 16px',
      }}
    >
      <SidebarNavItem collapsed={collapsed} to="/" icon={<HomeIcon />} label={t('home')} />
      <SidebarNavItem collapsed={collapsed} to="/search" icon={<SearchIcon />} label={t('search')} />
      <SidebarNavItem collapsed={collapsed} to="/library" icon={<LibraryIcon />} label={t('library')} />
      <SidebarNavItem collapsed={collapsed} to="/downloads" icon={<DownloadsIcon />} label={t('downloads')} />
      <SidebarNavItem collapsed={collapsed} to="/settings" icon={<SettingsIcon />} label={t('settings')} />
    </nav>
  );
}
