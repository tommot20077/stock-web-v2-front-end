// ESLint flat config — 起步採保守規則集（essential + recommended），
// 之後隨 codebase 清理逐步收緊（no-explicit-any、stylistic 規則等）。
import js from '@eslint/js';
import pluginVue from 'eslint-plugin-vue';
import tseslint from 'typescript-eslint';
import prettierCompat from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/essential'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
    },
  },
  {
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      // 既有 codebase 尚有 any 使用點，先降為 warn 作為 ratchet 指標，清零後改回 error
      '@typescript-eslint/no-explicit-any': 'warn',
      // 頁面元件（Chart、Trades 等）採單字命名，屬既有慣例
      'vue/multi-word-component-names': 'off',
      // SettingsNotificationPreferences 以 v-model 直接改 prop（5 處）。正確修法是改成
      // :checked + @change 往上 emit，會連帶改動 Settings.vue，而這塊目前沒有任何測試覆蓋。
      // 先降為 warn 當 ratchet 指標，修完改回 error；追蹤見 todo。
      'vue/no-mutating-props': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  prettierCompat,
);
