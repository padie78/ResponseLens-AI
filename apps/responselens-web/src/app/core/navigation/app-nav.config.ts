export type AppNavIcon =
  | 'own'
  | 'competitors'
  | 'stats'
  | 'ranking'
  | 'history'
  | 'settings';

export type AppNavSectionId = 'ops' | 'intel' | 'system';

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

export interface AppNavSection {
  id: AppNavSectionId;
  label: string;
  items: AppSubnavItem[];
}

/**
 * IA de navegación alineada a listening tools (Brand24 / Sprout):
 * - Operación: feed y acciones del día
 * - Inteligencia: visión comparativa y ranking
 * - Sistema: perfil de empresa e integraciones
 *
 * La salud de marca vive DENTRO de Propios (no como botón suelto de stats).
 */
export const APP_NAV_SECTIONS: AppNavSection[] = [
  {
    id: 'ops',
    label: 'Operación',
    items: [
      {
        id: 'own',
        label: 'Propios',
        title: 'Propios',
        description: 'Salud de marca + menciones y crisis',
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
        id: 'history',
        label: 'Historial',
        title: 'Historial',
        description: 'Respuestas y captaciones',
        route: '/app/history',
        icon: 'history',
      },
    ],
  },
  {
    id: 'intel',
    label: 'Inteligencia',
    items: [
      {
        id: 'stats',
        label: 'Insights',
        title: 'Insights',
        description: 'Comparativa Propios vs Competencia',
        route: '/app/stats',
        icon: 'stats',
      },
      {
        id: 'ranking',
        label: 'Ranking',
        title: 'Ranking',
        description: 'Score de vida digital de rivales',
        route: '/app/ranking',
        icon: 'ranking',
      },
    ],
  },
  {
    id: 'system',
    label: 'Sistema',
    items: [
      {
        id: 'settings',
        label: 'Empresa',
        title: 'Empresa y config',
        description: 'Perfil, rivales e integraciones',
        route: '/app/settings',
        icon: 'settings',
      },
    ],
  },
];

/** Flat list (compat). */
export const APP_SUBNAV_ITEMS: AppSubnavItem[] = APP_NAV_SECTIONS.flatMap((s) => s.items);

export const APP_ROUTE_TITLES: Record<string, string> = {
  own: 'Propios',
  competitors: 'Competencia',
  stats: 'Insights',
  ranking: 'Ranking',
  history: 'Historial',
  settings: 'Empresa',
};
