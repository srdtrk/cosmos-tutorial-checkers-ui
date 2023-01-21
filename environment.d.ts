// Let typescript know about the existance and types of constants in .env
declare global {
    namespace NodeJS {
        interface ProcessEnv {
            RPC_URL: string;
            MNEMONIC_TEST_ALICE: string;
            ADDRESS_TEST_ALICE: string;
            MNEMONIC_TEST_BOB: string;
            ADDRESS_TEST_BOB: string;
        }
    }
}

export {};
