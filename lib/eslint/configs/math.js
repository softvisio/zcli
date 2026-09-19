import eslintMath from "eslint-plugin-math";

const configs = {
    "refactoring": [

        // recommended
        eslintMath.configs.recommended,
    ],
};

export default Super =>
    class extends Super {

        // protected
        _createConfig () {
            const config = super._createConfig();

            if ( this.refactoring ) {
                config.push( ...configs.refactoring );
            }

            return config;
        }
    };
