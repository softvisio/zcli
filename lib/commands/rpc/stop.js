import Command from "#lib/command";
import RpcApi from "#lib/rpc/api";

export default class extends Command {

    // static
    static cli () {
        return {};
    }

    // public
    async run () {
        const api = new RpcApi();

        await api.call( "stop" );
    }
}
