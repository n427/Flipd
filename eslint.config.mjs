import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  {
    linterOptions: {
      reportUnusedDisableDirectives: false,
    },
    rules: {
      '@next/next/no-img-element': 'off',
      '@next/next/no-location-assign-relative-destination': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  globalIgnores(['.next/**', 'node_modules/**', 'mobile/**']),
]);
