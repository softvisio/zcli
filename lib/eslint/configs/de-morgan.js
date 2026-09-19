import eslintDeMorgan from "eslint-plugin-de-morgan";

const configs = {
    "refactoring": [

        // recommended
        eslintDeMorgan.configs.recommended,
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
