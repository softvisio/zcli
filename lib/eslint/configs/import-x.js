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
                "import-x/resolver-next": [
                    {
                        "interfaceVersion": 3,
                        "name": "noop-resolver",
                        "resolve" ( source, file ) {
                            return {
                                "found": true,
                                "path": null,
                            };
                        } },
                ],
            },
            "rules": {
                "import-x/default": "error",
                "import-x/export": "error",
                "import-x/first": "error",
                "import-x/namespace": [
                    "error",
                    {
                        "allowComputed": true,
                    },
                ],
                "import-x/newline-after-import": "error",
                "import-x/no-duplicates": "error",
                "import-x/no-named-as-default": "off",
                "import-x/no-named-as-default-member": "off",
                "import-x/no-named-default": "error",
                "import-x/no-unresolved": "off",
            },
        },
    ],
    "experimental": [
        {
            "name": "import-x/experimental",
            "rules": {

                // XXX not detected re-export from "node:"
                "import-x/named": "error",

                // XXX nodejs crash
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

            if ( this.experimental ) {
                config.push( ...configs.experimental );
            }

            return config;
        }
    };
