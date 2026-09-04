import { Given, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { MonopolyWorld } from '../support/world';

Given('je visite la page d\'accueil', async function (this: MonopolyWorld) {
  await this.page.goto(this.baseUrl);
});

Then('la page se charge sans erreur', async function (this: MonopolyWorld) {
  const isVisible = await this.page.locator('body').isVisible();
  assert.equal(isVisible, true);
});
