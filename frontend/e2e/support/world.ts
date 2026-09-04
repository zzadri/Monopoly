import { setWorldConstructor, World, IWorldOptions } from '@cucumber/cucumber';
import { Browser, BrowserContext, Page, chromium } from 'playwright';

export class MonopolyWorld extends World {
  browser!: Browser;
  context!: BrowserContext;
  page!: Page;
  baseUrl = process.env['E2E_BASE_URL'] ?? 'http://localhost:4200';

  constructor(options: IWorldOptions) {
    super(options);
  }

  async open() {
    this.browser = await chromium.launch();
    this.context = await this.browser.newContext();
    this.page = await this.context.newPage();
  }

  async close() {
    await this.browser?.close();
  }
}

setWorldConstructor(MonopolyWorld);
