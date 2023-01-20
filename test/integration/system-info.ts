/// Because the intention is to run these tests against a running chain they cannot expect too much,
/// such as how many games have been created so far.
/// Still, it is possible to at least test that the connection is made and queries pass through.

import { expect } from "chai";
import { config } from "dotenv";
import _ from "../../environment"; // actively inform on the string type and avoid any compilation error.
import { CheckersStargateClient } from "../../src/checkers_stargateclient";
import { CheckersExtension } from "../../src/modules/checkers/queries";

config();

describe("SystemInfo", function () {
    let client: CheckersStargateClient, checkers: CheckersExtension["checkers"];

    before("create client", async function () {
        client = await CheckersStargateClient.connect(process.env.RPC_URL);
        checkers = client.checkersQueryClient!.checkers;
    });

    it("can get system info", async function () {
        const systemInfo = await checkers.getSystemInfo();
        expect(systemInfo.nextId.toNumber()).to.be.greaterThanOrEqual(1);
        expect(parseInt(systemInfo.fifoHeadIndex, 10)).to.be.greaterThanOrEqual(
            -1
        );
        expect(parseInt(systemInfo.fifoTailIndex, 10)).to.be.greaterThanOrEqual(
            -1
        );
    });
});
