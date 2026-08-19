import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';

export const APP_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./pages/home/home.page').then((m) => m.HomePageComponent),
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./pages/auth/auth-entry.page').then((m) => m.AuthEntryPageComponent),
  },
  {
    path: 'register',
    loadComponent: () =>
      import('./pages/auth/auth-entry.page').then((m) => m.AuthEntryPageComponent),
  },
  {
    path: 'auth/callback',
    loadComponent: () =>
      import('./pages/auth/callback.page').then((m) => m.AuthCallbackPageComponent),
  },
  {
    path: 'app',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/shell/shell.page').then((m) => m.ShellPageComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'overview' },
      {
        path: 'overview',
        loadComponent: () =>
          import('./pages/overview/overview.page').then((m) => m.OverviewPageComponent),
      },
      {
        path: 'own',
        loadComponent: () => import('./pages/own/own.page').then((m) => m.OwnPageComponent),
      },
      {
        path: 'digest',
        loadComponent: () =>
          import('./pages/digest/digest.page').then((m) => m.DigestPageComponent),
      },
      {
        path: 'own/audit',
        loadComponent: () =>
          import('./pages/own/own-audit.page').then((m) => m.OwnAuditPageComponent),
      },
      {
        path: 'campaigns',
        loadComponent: () =>
          import('./pages/campaigns/campaigns.page').then((m) => m.CampaignsPageComponent),
      },
      {
        path: 'competitors',
        loadComponent: () =>
          import('./pages/competitors/competitors.page').then((m) => m.CompetitorsPageComponent),
      },
      {
        path: 'rivals/ads',
        loadComponent: () =>
          import('./pages/rivals/rivals-ads.page').then((m) => m.RivalsAdsPageComponent),
      },
      {
        path: 'rivals/talent',
        loadComponent: () =>
          import('./pages/rivals/rivals-talent.page').then((m) => m.RivalsTalentPageComponent),
      },
      {
        path: 'rivals/visibility',
        loadComponent: () =>
          import('./pages/rivals/rivals-visibility.page').then((m) => m.RivalsVisibilityPageComponent),
      },
      {
        path: 'rivals/battlecards',
        loadComponent: () =>
          import('./pages/rivals/rivals-battlecards.page').then((m) => m.RivalsBattlecardsPageComponent),
      },
      {
        path: 'discovery',
        loadComponent: () =>
          import('./pages/discovery/discovery.page').then((m) => m.DiscoveryPageComponent),
      },
      {
        path: 'trends',
        loadComponent: () =>
          import('./pages/trends/trends.page').then((m) => m.TrendsPageComponent),
      },
      {
        path: 'alerts',
        loadComponent: () =>
          import('./pages/alerts/alerts.page').then((m) => m.AlertsPageComponent),
      },
      {
        path: 'stats',
        loadComponent: () => import('./pages/stats/stats.page').then((m) => m.StatsPageComponent),
      },
      {
        path: 'ranking',
        loadComponent: () =>
          import('./pages/ranking/ranking.page').then((m) => m.RankingPageComponent),
      },
      {
        path: 'history',
        loadComponent: () =>
          import('./pages/history/history.page').then((m) => m.HistoryPageComponent),
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./pages/settings/settings.page').then((m) => m.SettingsPageComponent),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
