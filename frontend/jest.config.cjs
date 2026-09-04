const { createCjsPreset } = require('jest-preset-angular/presets');

module.exports = {
  ...createCjsPreset(),
  setupFilesAfterEnv: ['<rootDir>/setup-jest.ts'],
  // keycloak-js ships ESM syntax in a plain .js file — extend the preset's
  // default (which only lets .mjs through) so it gets transformed too.
  transformIgnorePatterns: ['node_modules/(?!(.*\\.mjs$|@angular/common/locales/.*\\.js$|keycloak-js/.*\\.js$))'],
};
