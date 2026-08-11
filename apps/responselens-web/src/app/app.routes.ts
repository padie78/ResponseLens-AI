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
      { path: '', pathMatch: 'full', redirectTo: 'own' },
      {
        path: 'own',
        loadComponent: () => import('./pages/own/own.page').then((m) => m.OwnPageComponent),
      },
      {
        path: 'competitors',
        loadComponent: () =>
          import('./pages/competitors/competitors.page').then((m) => m.CompetitorsPageComponent),
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
