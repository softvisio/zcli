import eslintMath from "eslint-plugin-math";

const configs = {
    "code": [

        // recommended
        eslintMath.configs.recommended,
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
