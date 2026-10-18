import Api from "#core/api";
import { tryConnect } from "#core/net";
import { apiPort, host } from "./constants.js";

export default class ApiClient extends Api {
    constructor () {
        super( `ws://${ host }:${ apiPort }/` );
    }

    // static
    static async tryConnect () {
        return tryConnect( apiPort, host );
    }
}
