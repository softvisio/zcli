import eslintPromise from "eslint-plugin-promise";

const configs = {
    "code": [

        // recommended
        eslintPromise.configs[ "flat/recommended" ],

        // custom
        {
            "name": "promise custom",
            "rules": {
                "promise/always-return": [
                    "error",
                    {
                        "ignoreLastCallback": true,
                    },
                ],
                "promise/catch-or-return": "error",
                "promise/no-callback-in-promise": "error",
                "promise/no-multiple-resolved": "error",
                "promise/no-nesting": "error",
                "promise/no-promise-in-callback": "error",
                "promise/no-return-in-finally": "error",
                "promise/prefer-await-to-callbacks": "off",
                "promise/prefer-await-to-then": "off",
                "promise/prefer-catch": "error",
                "promise/spec-only": "error",
                "promise/valid-params": "error",
            },
        },
    ],
};

export default Super =>
    class extends Super {

        // protected
        _createConfig () {
            const config = super._createConfig();

            if ( this.code ) {
                config.push( ...configs.code );
            }

            return config;
        }
    };
