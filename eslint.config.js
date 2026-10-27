import eslintPluginAstro from "eslint-plugin-astro";

export default [
    {
        ignores: [
            ".astro/",
            "dist/",
            "coverage/",
            "playwright-report/",
            "test-results/",
            "hello-cdk/cdk.out/",
        ],
    },
    ...eslintPluginAstro.configs.recommended,
    {
        rules: {
            "eqeqeq": ["error", "always"],
            "no-debugger": "error",
            "no-unused-vars": [
                "warn",
                {
                    argsIgnorePattern: "^_",
                    caughtErrorsIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                },
            ],
            "no-var": "error",
            "prefer-const": "error",
        },
    },
];
