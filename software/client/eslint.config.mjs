// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(eslint.configs.recommended, tseslint.configs.strict, tseslint.configs.stylistic, {
    // files: ['src/**/*.ts', 'src/**/*.tsx'],
    languageOptions: {
        parserOptions: {
            project: true,
            tsconfigRootDir: import.meta.dirname,
        },
    },
    rules: {
        '@typescript-eslint/no-floating-promises': 'error',
    },
});
