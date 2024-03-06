import * as pulumi from "@pulumi/pulumi";
import { BigNumber } from "ethers";
import { StorageGasOracleResource, getSigner } from "./storage-gas-oracle";

// Create a storage gas oracle
export const storageGasOracle = new StorageGasOracleResource('StorageGasOracle', {
    owner: getSigner().address,
    remoteGasDataConfigs: {
        1: {
            tokenExchangeRate: BigNumber.from(2),
            gasPrice: BigNumber.from(3),
        },

        2: {
            tokenExchangeRate: BigNumber.from(200),
            gasPrice: BigNumber.from(300),
        },
    }
});
