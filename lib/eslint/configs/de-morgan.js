import eslintDeMorgan from "eslint-plugin-de-morgan";

const configs = {
    "code": [

        // recommended
        eslintDeMorgan.configs.recommended,
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
