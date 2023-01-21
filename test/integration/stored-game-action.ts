import { OfflineDirectSigner } from "@cosmjs/proto-signing";
import { expect } from "chai";
import { getSignerFromMnemonic } from "../../src/util/signer";
import _ from "../../environment";
import { CheckersSigningStargateClient } from "../../src/checkers_signingstargateclient";
import { CheckersExtension } from "../../src/modules/checkers/queries";
import { DeliverTxResponse, GasPrice } from "@cosmjs/stargate";
import Long from "long";
import { Log } from "@cosmjs/stargate/build/logs";
import { StoredGame } from "../../src/types/generated/checkers/stored_game";
import {
    getCreatedGameId,
    getCreateGameEvent,
} from "../../src/types/checkers/events";

describe("StoredGame Action", function () {
    const {
        RPC_URL,
        ADDRESS_TEST_ALICE: alice,
        ADDRESS_TEST_BOB: bob,
    } = process.env;
    let aliceSigner: OfflineDirectSigner, bobSigner: OfflineDirectSigner;

    before("create signers", async function () {
        aliceSigner = await getSignerFromMnemonic(
            process.env.MNEMONIC_TEST_ALICE
        );
        bobSigner = await getSignerFromMnemonic(process.env.MNEMONIC_TEST_BOB);
        expect((await aliceSigner.getAccounts())[0].address).to.equal(alice);
        expect((await bobSigner.getAccounts())[0].address).to.equal(bob);
    });

    let aliceClient: CheckersSigningStargateClient,
        bobClient: CheckersSigningStargateClient,
        checkers: CheckersExtension["checkers"];

    before("create signing clients", async function () {
        aliceClient = await CheckersSigningStargateClient.connectWithSigner(
            RPC_URL,
            aliceSigner,
            {
                gasPrice: GasPrice.fromString("0stake"),
            }
        );
        bobClient = await CheckersSigningStargateClient.connectWithSigner(
            RPC_URL,
            bobSigner,
            {
                gasPrice: GasPrice.fromString("0stake"),
            }
        );
        checkers = aliceClient.checkersQueryClient!.checkers;
    });

    // check that a game can be created with a wager:
    let gameIndex: string;

    it("can create game with wager", async function () {
        this.timeout(5_000);
        const response: DeliverTxResponse = await aliceClient.createGame(
            alice,
            alice,
            bob,
            "token",
            Long.fromNumber(1),
            "auto"
        );
        const logs: Log[] = JSON.parse(response.rawLog!);
        expect(logs).to.be.length(1);
        gameIndex = getCreatedGameId(getCreateGameEvent(logs[0])!);
        const game: StoredGame = (await checkers.getStoredGame(gameIndex))!;
        expect(game).to.include({
            index: gameIndex,
            black: alice,
            red: bob,
            denom: "token",
        });
        expect(game.wager.toNumber()).to.equal(1);
    });

    // make move and pay wager

    it("can play first moves and pay wager", async function () {
        this.timeout(10_000);
        const aliceBalBefore = parseInt(
            (await aliceClient.getBalance(alice, "token")).amount,
            10
        );
        await aliceClient.playMove(
            alice,
            gameIndex,
            { x: 1, y: 2 },
            { x: 2, y: 3 },
            "auto"
        );
        expect(
            parseInt((await aliceClient.getBalance(alice, "token")).amount, 10)
        ).to.be.equal(aliceBalBefore - 1);
        const bobBalBefore = parseInt(
            (await aliceClient.getBalance(bob, "token")).amount,
            10
        );
        await bobClient.playMove(
            bob,
            gameIndex,
            { x: 0, y: 5 },
            { x: 1, y: 4 },
            "auto"
        );
        expect(
            parseInt((await aliceClient.getBalance(bob, "token")).amount, 10)
        ).to.be.equal(bobBalBefore - 1);
    });
});
