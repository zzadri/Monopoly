import { After, Before } from '@cucumber/cucumber';
import { MonopolyWorld } from './world';

Before(async function (this: MonopolyWorld) {
  await this.open();
});

After(async function (this: MonopolyWorld) {
  await this.close();
});
