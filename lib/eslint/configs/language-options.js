// import babelEslintParser from "@babel/eslint-parser";
// import { createConfig } from "@corejslib/babel";

const configs = {
    "overrides": [
        {
            "name": "language options",
            "languageOptions": {
                "sourceType": "module",
                "ecmaVersion": "latest",

                "parserOptions": {
                    "sourceType": "module",
                    "ecmaVersion": "latest",
                    "ecmaFeatures": {
                        "jsx": true,
                    },

                    "requireConfigFile": false,

                    // "parser": babelEslintParser,
                    // "babelOptions": createConfig(),
                },
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
