module.exports = {
  root: true,
  env: {
    browser: true,
    node: true
  },
  parserOptions: {
    parser: 'babel-eslint'
  },
  extends: [
    'standard'
  ],
  // add your custom rules here
  rules: {
    'prefer-const': 0,
    'vue/attributes-order': 0,
    'vue/require-default-prop': 0,
    'no-console': 0
  }
}
