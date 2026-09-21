import eslintSimpleImportSort from "eslint-plugin-simple-import-sort";

const configs = {
    "default": [
        {
            "name": "simple-import-sort",
            "plugins": {
                "import-sort": eslintSimpleImportSort,
            },
            "rules": {
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
            "name": "simple-import-sort/overrides",
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
