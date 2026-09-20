import eslintCorejslib from "@corejslib/eslint-plugin";

const configs = {
    "overrides": [

        // @corejslib:recommended
        eslintCorejslib.configs.recommended,

        // @corejslib:custom
        {
            "name": "@corejslib/custom",
            "rules": {
                "@corejslib/camel-case": [
                    "error",
                    {
                        "properties": "never",
                        "ignoreImports": true,
                        "strictCamelCase": true,
                    },
                ],
            },
        },
    ],
};

export default Super =>
    class extends Super {

        // protected
        _createOverrides () {
            const config = super._createOverrides();

            config.push( ...configs.overrides );

            return config;
        }
    };
