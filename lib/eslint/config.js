export default class EslintConfig {
    #editorconfig;
    #code;
    #experimental;

    constructor ( { editorconfig, code, experimental } = {} ) {
        this.#editorconfig = editorconfig;
        this.#code = Boolean( code );
        this.#experimental = Boolean( experimental );
    }

    // properties
    get editorconfig () {
        return this.#editorconfig;
    }

    get code () {
        return this.#code;
    }

    get experimental () {
        return this.#experimental;
    }

    // public
    create () {
        const config = [ ...this._createConfig() ];

        if ( this.editorConfig ) {
            config.push( ...this._createEditorConfig() );
        }

        config.push( ...this._createOverrides() );

        return config;
    }

    // protected
    _createConfig () {
        return [];
    }

    _createEditorConfig () {
        return [];
    }

    _createOverrides () {
        return [];
    }
}
