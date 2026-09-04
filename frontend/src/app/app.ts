import { Component } from '@angular/core';
import { AppShell } from './layout/app-shell/app-shell';

@Component({
  imports: [AppShell],
  selector: 'app-root',
  template: '<app-shell />',
})
export class App {}
