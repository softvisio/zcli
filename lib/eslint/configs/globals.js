import globals from "globals";

const configs = {
    "default": [
        {
            "name": "globals",
            "languageOptions": {
                "globals": {
                    ...globals.node,
                    ...globals.browser,

                    // custom
                    "Ext": "readonly",
                    "l10n": "readonly",
                    "l10nt": "readonly",
                    "msgid": "readonly",
                    "result": "readonly",
                },
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
