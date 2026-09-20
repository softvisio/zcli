import eslintImportX from "eslint-plugin-import-x";
import eslintSimpleImportSort from "eslint-plugin-simple-import-sort";

// import { fileURLToPath } from "node:url";
// const nodeResolverPath = fileURLToPath( new URL( "import/resolve.cjs", import.meta.url ) );

const configs = {
    "default": [
        {
            "name": "import",
            "plugins": {
                "import-x": eslintImportX,
                "import-sort": eslintSimpleImportSort,
            },
            "settings": {
                "import-x/resolver": {

                    // [ nodeResolverPath ]: {},
                    // "node": true,
                    // "webpack": true,
                    // "typescript": true,
                },
                "import-x/parsers": {
                    "typescript-eslint/parser": [ ".ts", ".tsx", ".mts", ".cts" ],
                    "vue-eslint-parser": [ ".vue" ],
                },
            },
            "rules": {
                "import-x/export": "error",
                "import-x/no-named-as-default-member": "error",
                "import-x/no-duplicates": "error",
                "import-x/first": "error",
                "import-x/newline-after-import": "error",

                // "import-x/no-unresolved": "error",
                // "import-x/default": "error",
                // "import-x/no-named-as-default": "error",

                // XXX does not supports re-exports
                "import-x/namespace": [
                    "error",
                    {
                        "allowComputed": true,
                    },
                ],

                // XXX does not supports re-exporrt
                "import-x/named": "error",

                "import-x/no-cycle": [
                    "error",
                    {
                        "maxDepth": Infinity,
                        "allowUnsafeDynamicCyclicDependency": true,
                    },
                ],

                "import-sort/imports": [
                    "error",
                    {
                        "groups": [ [ "^\\u0000", "^node:", "^@?\\w", "^", "^\\." ] ],
                    },
                ],
                "import-sort/exports": "error",
            },
        },
    ],
    "overrides": [
        {
            "name": "import/overrides",
            "rules": {
                "sort-imports": "off",
                "import-x/order": "off",
            },
        },
    ],
};

export default Super =>
    class extends Super {

        // protected
        _createConfig () {
            const config = super._createConfig();

            config.push( ...configs.default );

            return config;
        }

        _createOverrides () {
            const config = super._createOverrides();

            config.push( ...configs.overrides );

            return config;
        }
    };
