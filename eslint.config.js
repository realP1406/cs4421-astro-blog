import eslintPluginAstro from "eslint-plugin-astro";

export default [
       { ignores: ["dist/", "coverage/", "playwright-report/", "test-results/", "hello-cdk/cdk.out/"] },
    ...eslintPluginAstro.configs.recommended,
    {
        rules: {
        },
    },
];