export type AppNavSectionId = 'home' | 'ops' | 'intel' | 'discover' | 'system';

export interface AppNavLink {
  id: string;
  label: string;
  title: string;
  description: string;
  route: string;
  queryParams?: Record<string, string>;
  icon: string;
  exact?: boolean;
  badge?: 'own' | 'rival' | 'alerts';
  comingSoon?: boolean;
}

export interface AppNavGroup {
  id: string;
  label: string;
  icon: string;
  children: AppNavLink[];
}

export type AppNavNode = AppNavLink | AppNavGroup;

export interface AppNavSection {
  id: AppNavSectionId;
  label: string;
  items: AppNavNode[];
}

export function isNavGroup(node: AppNavNode): node is AppNavGroup {
  return Array.isArray((node as AppNavGroup).children);
}

/** IA: operación interna × inteligencia competitiva × descubrimiento × control. */
export const APP_NAV_SECTIONS: AppNavSection[] = [
  {
    id: 'home',
    label: '',
    items: [
      {
        id: 'overview',
        label: 'Inicio',
        title: 'Inicio',
        description: 'Overview del espacio de trabajo',
        route: '/app/overview',
        icon: 'pi pi-home',
        exact: true,
      },
    ],
  },
  {
    id: 'ops',
    label: 'Mi empresa',
    items: [
      {
        id: 'inbox',
        label: 'Bandeja',
        title: 'Bandeja',
        description: 'Todas las menciones propias, por estado',
        route: '/app/own',
        icon: 'pi pi-inbox',
        badge: 'own',
      },
      {
        id: 'digest',
        label: 'Digest diario',
        title: 'Digest',
        description: 'Urgentes y leads para copiar',
        route: '/app/digest',
        icon: 'pi pi-send',
      },
      {
        id: 'campaigns',
        label: 'Mis campañas',
        title: 'Campañas',
        description: 'Ads propios Meta + Google',
        route: '/app/campaigns',
        icon: 'pi pi-wallet',
      },
      {
        id: 'audit',
        label: 'Auditoría de marca',
        icon: 'pi pi-chart-bar',
        children: [
          {
            id: 'own-diagnosis',
            label: 'Diagnóstico',
            title: 'Diagnóstico',
            description: 'Veredicto y cobertura de reputación',
            route: '/app/own/audit',
            queryParams: { tab: 'overview' },
            icon: 'pi pi-compass',
          },
          {
            id: 'own-sentiment',
            label: 'Evolución del sentimiento',
            title: 'Sentimiento',
            description: 'Stats y pulse de reputación',
            route: '/app/own/audit',
            queryParams: { tab: 'stats' },
            icon: 'pi pi-chart-line',
          },
          {
            id: 'own-themes',
            label: 'Categorías y dolor',
            title: 'Temas',
            description: 'Puntos de dolor y categorías',
            route: '/app/own/audit',
            queryParams: { tab: 'themes' },
            icon: 'pi pi-tags',
          },
        ],
      },
    ],
  },
  {
    id: 'intel',
    label: 'Inteligencia competitiva',
    items: [
      {
        id: 'competitors',
        label: 'Radar de menciones',
        title: 'Competencia',
        description: 'Quejas de rivales y captación',
        route: '/app/competitors',
        icon: 'pi pi-bolt',
        badge: 'rival',
      },
      {
        id: 'battlecards',
        label: 'Fichas de batalla',
        title: 'Battlecards',
        description: 'Ficha competitiva automatizada',
        route: '/app/rivals/battlecards',
        icon: 'pi pi-book',
      },
      {
        id: 'rival-ads',
        label: 'Radar de anuncios',
        title: 'Anuncios activos',
        description: 'Creatividades y campañas de rivales',
        route: '/app/rivals/ads',
        icon: 'pi pi-megaphone',
      },
      {
        id: 'rival-talent',
        label: 'Reputación y talento',
        title: 'Talento / HR',
        description: 'Señales de empleo y Glassdoor',
        route: '/app/rivals/talent',
        icon: 'pi pi-users',
      },
      {
        id: 'rival-web',
        label: 'Visibilidad web',
        title: 'Tráfico y SEO',
        description: 'Visibilidad y tráfico de rivales',
        route: '/app/rivals/visibility',
        icon: 'pi pi-globe',
      },
      {
        id: 'ranking',
        label: 'Ranking',
        title: 'Ranking',
        description: 'Score de vida digital de rivales',
        route: '/app/ranking',
        icon: 'pi pi-chart-bar',
      },
      {
        id: 'stats',
        label: 'Insights',
        title: 'Insights',
        description: 'Comparativa Propios vs Competencia',
        route: '/app/stats',
        icon: 'pi pi-chart-pie',
      },
    ],
  },
  {
    id: 'discover',
    label: 'Descubrimiento e industria',
    items: [
      {
        id: 'discovery',
        label: 'Feed global',
        title: 'Feed global',
        description: 'Menciones de industria por tus keywords',
        route: '/app/discovery',
        icon: 'pi pi-comments',
      },
      {
        id: 'trends',
        label: 'Tendencias del mercado',
        title: 'Keywords',
        description: 'Tendencias y volumen por keyword',
        route: '/app/trends',
        icon: 'pi pi-chart-line',
      },
    ],
  },
  {
    id: 'system',
    label: 'Control y ajustes',
    items: [
      {
        id: 'alerts',
        label: 'Centro de alertas',
        title: 'Alertas',
        description: 'Llegadas del scanner',
        route: '/app/alerts',
        icon: 'pi pi-bell',
        badge: 'alerts',
      },
      {
        id: 'history',
        label: 'Historial',
        title: 'Historial',
        description: 'Respuestas y captaciones',
        route: '/app/history',
        icon: 'pi pi-history',
      },
      {
        id: 'settings',
        label: 'Configuración',
        title: 'Empresa y config',
        description: 'Perfil, rivales e integraciones',
        route: '/app/settings',
        icon: 'pi pi-cog',
      },
    ],
  },
];

export function flattenNavLinks(sections: AppNavSection[] = APP_NAV_SECTIONS): AppNavLink[] {
  const out: AppNavLink[] = [];
  for (const section of sections) {
    for (const item of section.items) {
      if (isNavGroup(item)) out.push(...item.children);
      else out.push(item);
    }
  }
  return out;
}

/** Compat portal / subnav: hojas navegables. */
export type AppSubnavItem = AppNavLink;
export const APP_SUBNAV_ITEMS: AppSubnavItem[] = flattenNavLinks();

export const APP_ROUTE_TITLES: Record<string, string> = {
  overview: 'Inicio',
  own: 'Bandeja',
  digest: 'Digest diario',
  campaigns: 'Mis campañas',
  competitors: 'Competencia',
  stats: 'Insights',
  ranking: 'Ranking',
  history: 'Historial',
  settings: 'Configuración',
  discovery: 'Feed global',
  trends: 'Tendencias',
  alerts: 'Alertas',
  ads: 'Anuncios',
  talent: 'Talento',
  visibility: 'Visibilidad web',
  battlecards: 'Fichas de batalla',
};
