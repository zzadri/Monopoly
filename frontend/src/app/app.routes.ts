import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/home/home').then((m) => m.Home),
  },
  {
    path: 'lobby',
    loadComponent: () => import('./pages/lobby/lobby').then((m) => m.Lobby),
  },
  {
    path: 'lobby/create',
    loadComponent: () => import('./pages/create-game/create-game').then((m) => m.CreateGame),
  },
  {
    path: 'game/:id',
    loadComponent: () => import('./pages/game/game').then((m) => m.Game),
  },
  {
    path: 'leaderboard',
    loadComponent: () => import('./pages/leaderboard/leaderboard').then((m) => m.Leaderboard),
  },
  { path: '**', redirectTo: '' },
];
