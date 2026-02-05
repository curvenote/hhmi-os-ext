module.exports = {
  root: true,
  extends: ['../../.eslintrc.cjs'],
  overrides: [
    {
      files: ['**/*.spec.ts', '**/*.test.ts'],
      rules: {
        'import/no-extraneous-dependencies': 'off',
      },
    },
  ],
};