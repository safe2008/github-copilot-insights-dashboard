import nextVitals from 'eslint-config-next/core-web-vitals';

const eslintConfig = [
  ...nextVitals,
  {
    // Pin the React version so eslint-plugin-react skips runtime auto-detection
    // (recommended by the plugin, and avoids version-probing filesystem calls).
    settings: {
      react: { version: '19.2' },
    },
    rules: {
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  {
    ignores: ['dist/**'],
  },
];

export default eslintConfig;
