import { DeliverTxResponse } from "@cosmjs/stargate";
import { Log } from "@cosmjs/stargate/build/logs";
import Long from "long";
import { CheckersSigningStargateClient } from "src/checkers_signingstargateclient";
import { CheckersStargateClient } from "src/checkers_stargateclient";
import { IGameInfo } from "src/sharedTypes";
import { QueryCanPlayMoveResponse } from "../generated/checkers/query";
import { StoredGame } from "../generated/checkers/stored_game";
import { guiPositionToPos, storedToGameInfo } from "./board";
import { getCreatedGameId, getCreateGameEvent } from "./events";

declare module "../../checkers_stargateclient" {
    interface CheckersStargateClient {
        getGuiGames(): Promise<IGameInfo[]>;
        getGuiGame(index: string): Promise<IGameInfo | undefined>;
        canPlayGuiMove(
            gameIndex: string,
            playerId: number,
            positions: number[][]
        ): Promise<QueryCanPlayMoveResponse>;
    }
}

CheckersStargateClient.prototype.getGuiGames = async function (): Promise<
    IGameInfo[]
> {
    return (
        await this.checkersQueryClient!.checkers.getAllStoredGames(
            Uint8Array.from([]),
            Long.ZERO,
            Long.fromNumber(20),
            true
        )
    ).storedGames.map(storedToGameInfo);
};

CheckersStargateClient.prototype.getGuiGame = async function (
    index: string
): Promise<IGameInfo | undefined> {
    const storedGame: StoredGame | undefined =
        await this.checkersQueryClient!.checkers.getStoredGame(index);
    if (!storedGame) return undefined;
    return storedToGameInfo(storedGame);
};

CheckersStargateClient.prototype.canPlayGuiMove = async function (
    gameIndex: string,
    playerId: number,
    positions: number[][]
): Promise<QueryCanPlayMoveResponse> {
    if (playerId < 1 || 2 < playerId)
        throw new Error(`Wrong playerId: ${playerId}`);
    return await this.checkersQueryClient!.checkers.canPlayMove(
        gameIndex,
        playerId === 1 ? "b" : "r",
        guiPositionToPos(positions[0]),
        guiPositionToPos(positions[1])
    );
};

declare module "../../checkers_signingstargateclient" {
    interface CheckersSigningStargateClient {
        createGuiGame(
            creator: string,
            black: string,
            red: string
        ): Promise<string>;
    }
}

CheckersSigningStargateClient.prototype.createGuiGame = async function (
    creator: string,
    black: string,
    red: string
): Promise<string> {
    const result: DeliverTxResponse = await this.createGame(
        creator,
        black,
        red,
        "stake",
        Long.ZERO,
        "auto"
    );
    const logs: Log[] = JSON.parse(result.rawLog!);
    return getCreatedGameId(getCreateGameEvent(logs[0])!);
};
