import Api from "#core/api";
import { tryConnect } from "#core/net";
import { apiPort, host } from "./constants.js";

export default class ApiClient extends Api {
    constructor () {
        super( `ws://${ host }:${ apiPort }/?maxConnections=1` );
    }

    // static
    static async tryConnect () {
        return tryConnect( apiPort, host );
    }
}
