// Let typescript know about the existance and types of constants in .env
declare global {
    namespace NodeJS {
        interface ProcessEnv {
            RPC_URL: string;
        }
    }
}

export {};
