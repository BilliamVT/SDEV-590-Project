import { Routes } from '@angular/router';

import { authGuard, guestGuard } from './auth/auth.guards';
import { Home } from './home/home';
import { Login } from './login/login';
import { Register } from './register/register';
import { Settings } from './settings/settings';

export const routes: Routes = [
  { path: '', component: Home, canActivate: [authGuard] },
  { path: 'settings', component: Settings, canActivate: [authGuard] },
  { path: 'login', component: Login, canActivate: [guestGuard] },
  { path: 'register', component: Register, canActivate: [guestGuard] },
  { path: '**', redirectTo: '' },
];
