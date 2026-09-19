export default class EslintConfig {
    #editorconfig;
    #refactoring;
    #experimental;

    constructor ( { editorconfig, refactoring, experimental } = {} ) {
        this.#editorconfig = editorconfig;
        this.#refactoring = Boolean( refactoring );
        this.#experimental = Boolean( experimental );
    }

    // properties
    get editorconfig () {
        return this.#editorconfig;
    }

    get refactoring () {
        return this.#refactoring;
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
