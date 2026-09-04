import { When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { MonopolyWorld } from '../support/world';

When('je clique sur {string}', async function (this: MonopolyWorld, label: string) {
  await this.page.getByRole('button', { name: label, exact: true }).first().click();
});

Then('je suis redirigé vers le realm Keycloak {string}', async function (this: MonopolyWorld, realm: string) {
  await this.page.waitForURL((url) => url.pathname.includes(`/realms/${realm}/`), { timeout: 10000 });
  assert.match(this.page.url(), new RegExp(`/realms/${realm}/protocol/openid-connect/auth`));
});
