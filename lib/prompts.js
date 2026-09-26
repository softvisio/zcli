import { readConfig } from "#core/config";

const PROMPTS = await readConfig( import.meta.resolve( "#resources/prompts.yaml" ) );

class Prompts {

    // public
    get ( id ) {
        return PROMPTS[ id ];
    }
}

export default new Prompts();
