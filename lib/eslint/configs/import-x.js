import eslintImportX from "eslint-plugin-import-x";

const configs = {
    "default": [
        {
            "name": "import-x",
            "plugins": {
                "import-x": eslintImportX,
            },
            "settings": {
                "import-x/parsers": {
                    "typescript-eslint/parser": [ ".ts", ".tsx", ".mts", ".cts" ],
                    "vue-eslint-parser": [ ".vue" ],
                },
            },
            "rules": {
                "import-x/export": "error",
                "import-x/no-duplicates": "error",
                "import-x/first": "error",
                "import-x/newline-after-import": "error",
                "import-x/no-named-as-default-member": "off",
                "import-x/no-named-as-default": "error",
                "import-x/no-named-default": "error",
                "import-x/no-unresolved": "error",
                "import-x/default": "error",
                "import-x/namespace": [
                    "error",
                    {
                        "allowComputed": true,
                    },
                ],
                "import-x/named": "error",
                "import-x/no-cycle": [
                    "error",
                    {
                        "maxDepth": Infinity,
                        "allowUnsafeDynamicCyclicDependency": true,
                    },
                ],

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
    };
