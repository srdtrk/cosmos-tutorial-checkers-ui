import { OfflineDirectSigner } from "@cosmjs/proto-signing";
import { expect } from "chai";
import { getSignerFromMnemonic } from "../../src/util/signer";
import _ from "../../environment";
import { CheckersSigningStargateClient } from "../../src/checkers_signingstargateclient";
import { CheckersExtension } from "../../src/modules/checkers/queries";
import { Account, DeliverTxResponse, GasPrice } from "@cosmjs/stargate";
import Long from "long";
import { Log } from "@cosmjs/stargate/build/logs";
import { StoredGame } from "../../src/types/generated/checkers/stored_game";
import {
    getCreatedGameId,
    getCreateGameEvent,
} from "../../src/types/checkers/events";
import {
    completeGame,
    GameMove,
    Player,
} from "../../src/types/checkers/player";
import { CheckersStargateClient } from "../../src/checkers_stargateclient";
import { typeUrlMsgPlayMove } from "../../src/types/checkers/messages";
import { TxRaw } from "cosmjs-types/cosmos/tx/v1beta1/tx";
import { BroadcastTxSyncResponse } from "@cosmjs/tendermint-rpc";
import { toHex } from "@cosmjs/encoding";

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

    // Prep for sending 22 transactions
    interface ShortAccountInfo {
        accountNumber: number;
        sequence: number;
    }
    const getShortAccountInfo = async (
        who: string
    ): Promise<ShortAccountInfo> => {
        const accountInfo: Account = (await aliceClient.getAccount(who))!;
        return {
            accountNumber: accountInfo.accountNumber,
            sequence: accountInfo.sequence,
        };
    };

    const whoseClient = (who: Player) => (who == "b" ? aliceClient : bobClient);
    const whoseAddress = (who: Player) => (who == "b" ? alice : bob);
    // get access to broadcastTxSync
    it("can continue the game up to before the double capture", async function () {
        this.timeout(10_000);
        const client: CheckersStargateClient =
            await CheckersStargateClient.connect(RPC_URL);
        const chainId: string = await client.getChainId();
        const accountInfo = {
            b: await getShortAccountInfo(alice),
            r: await getShortAccountInfo(bob),
        };
        // get all 22 signed transactions, index 2 to 23

        const txList: TxRaw[] = [];
        let txIndex: number = 2;
        while (txIndex < 24) {
            const gameMove: GameMove = completeGame[txIndex];
            txList.push(
                await whoseClient(gameMove.player).sign(
                    whoseAddress(gameMove.player),
                    [
                        {
                            typeUrl: typeUrlMsgPlayMove,
                            value: {
                                creator: whoseAddress(gameMove.player),
                                gameIndex: gameIndex,
                                fromX: gameMove.from.x,
                                fromY: gameMove.from.y,
                                toX: gameMove.to.x,
                                toY: gameMove.to.y,
                            },
                        },
                    ],
                    {
                        amount: [{ denom: "stake", amount: "0" }],
                        gas: "500000",
                    },
                    `playing move ${txIndex}`,
                    {
                        accountNumber:
                            accountInfo[gameMove.player].accountNumber,
                        sequence: accountInfo[gameMove.player].sequence++,
                        chainId: chainId,
                    }
                )
            );
            txIndex++;
        }

        // fire broadcast first 21 of them
        const hashes: BroadcastTxSyncResponse[] = [];
        txIndex = 0;
        while (txIndex < txList.length - 1) {
            const txRaw: TxRaw = txList[txIndex];
            hashes.push(
                await client.tmBroadcastTxSync(TxRaw.encode(txRaw).finish())
            );
            txIndex++;
        }
        // normally send the last transaction
        const lastDeliver: DeliverTxResponse = await client.broadcastTx(
            TxRaw.encode(txList[txList.length - 1]).finish()
        );
        // log the blocks
        console.log(
            txList.length,
            "transactions included in blocks from",
            (await client.getTx(toHex(hashes[0].hash)))!.height,
            "to",
            lastDeliver.height
        );
        // make sure we have the expected board
        const game: StoredGame = (await checkers.getStoredGame(gameIndex))!;
        expect(game.board).to.equal(
            "*b*b***b|**b*b***|***b***r|********|***r****|********|***r****|r*B*r*r*"
        );
    });
});
