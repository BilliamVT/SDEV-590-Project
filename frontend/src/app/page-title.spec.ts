import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Router, TitleStrategy, provideRouter } from '@angular/router';

import { PageTitleStrategy } from './page-title';

@Component({ template: '' })
class Blank {}

describe('PageTitleStrategy (BILLIAMVT-49)', () => {
  it('names each page, then the app', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'tasks', title: 'Your tasks', component: Blank },
          { path: 'untitled', component: Blank },
        ]),
        { provide: TitleStrategy, useClass: PageTitleStrategy },
      ],
    });
    const router = TestBed.inject(Router);
    const title = TestBed.inject(Title);

    await router.navigateByUrl('/tasks');
    expect(title.getTitle()).toBe('Your tasks – Housework Scheduler');
    await router.navigateByUrl('/untitled');
    expect(title.getTitle()).toBe('Housework Scheduler');
  });
});
