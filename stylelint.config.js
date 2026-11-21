/** @type {import('stylelint').Config} */
export default {
  extends: ['stylelint-config-standard'],
  customSyntax: 'postcss-html',
  rules: {
    // Blank lines between rules would only make the shipped popup larger.
    'rule-empty-line-before': null,
  },
};
