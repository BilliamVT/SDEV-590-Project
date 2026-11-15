import { Routes } from '@angular/router';

import { authGuard, guestGuard } from './auth/auth.guards';
import { Home } from './home/home';
import { Login } from './login/login';
import { Register } from './register/register';
import { Settings } from './settings/settings';
import { NewTask } from './task/new-task';
import { TaskList } from './task/task-list';

export const routes: Routes = [
  { path: '', title: 'Your week', component: Home, canActivate: [authGuard] },
  { path: 'settings', title: 'Settings', component: Settings, canActivate: [authGuard] },
  { path: 'tasks', title: 'Your tasks', component: TaskList, canActivate: [authGuard] },
  { path: 'tasks/new', title: 'New task', component: NewTask, canActivate: [authGuard] },
  { path: 'tasks/:id/edit', title: 'Edit task', component: NewTask, canActivate: [authGuard] },
  { path: 'login', title: 'Log in', component: Login, canActivate: [guestGuard] },
  { path: 'register', title: 'Create an account', component: Register, canActivate: [guestGuard] },
  { path: '**', redirectTo: '' },
];
