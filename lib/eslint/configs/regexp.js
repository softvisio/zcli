import eslintRegexp from "eslint-plugin-regexp";

const configs = {
    "default": [

        // recommended
        eslintRegexp.configs.recommended,

        // custom
        {
            "name": "regexp/custom",
            "rules": {
                "regexp/require-unicode-regexp": "error",
                "regexp/require-unicode-sets-regexp": "error",
            },
        },
    ],
    "overrides": [
        {
            "name": "regexp/overrides",
            "rules": {
                "no-control-regex": "off",
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
