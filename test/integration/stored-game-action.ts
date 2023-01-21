import { OfflineDirectSigner } from "@cosmjs/proto-signing";
import { expect } from "chai";
import { getSignerFromMnemonic } from "../../src/util/signer";
import _ from "../../environment";
import { CheckersSigningStargateClient } from "../../src/checkers_signingstargateclient";
import { CheckersExtension } from "../../src/modules/checkers/queries";
import { GasPrice } from "@cosmjs/stargate";

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
});
