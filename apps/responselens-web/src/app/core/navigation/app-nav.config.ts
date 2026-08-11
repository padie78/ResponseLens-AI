export type AppNavIcon = 'own' | 'competitors' | 'stats' | 'ranking' | 'settings';

export interface AppSubnavItem {
  id: string;
  label: string;
  title: string;
  description: string;
  route: string;
  icon: AppNavIcon;
  exact?: boolean;
  badge?: string;
}

/** Módulos del producto ResponseLens (extensión + web). */
export const APP_SUBNAV_ITEMS: AppSubnavItem[] = [
  {
    id: 'own',
    label: 'Propios',
    title: 'Propios',
    description: 'Menciones y crisis de tu marca',
    route: '/app/own',
    icon: 'own',
  },
  {
    id: 'competitors',
    label: 'Competencia',
    title: 'Competencia',
    description: 'Quejas de rivales y captación',
    route: '/app/competitors',
    icon: 'competitors',
  },
  {
    id: 'stats',
    label: 'Stats',
    title: 'Stats',
    description: 'KPIs y embudo',
    route: '/app/stats',
    icon: 'stats',
  },
  {
    id: 'ranking',
    label: 'Ranking',
    title: 'Ranking',
    description: 'Score de vida digital',
    route: '/app/ranking',
    icon: 'ranking',
  },
  {
    id: 'settings',
    label: 'Config',
    title: 'Configuración',
    description: 'Empresa, rivales e integraciones',
    route: '/app/settings',
    icon: 'settings',
  },
];

export const APP_ROUTE_TITLES: Record<string, string> = {
  own: 'Propios',
  competitors: 'Competencia',
  stats: 'Stats',
  ranking: 'Ranking',
  settings: 'Configuración',
};
