import disableAutofix from "eslint-plugin-disable-autofix";

const configs = {
    "default": [
        {
            "name": "no-fix",
            "plugins": {
                "no-fix": disableAutofix,
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
