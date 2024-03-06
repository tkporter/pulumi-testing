import * as pulumi from "@pulumi/pulumi";
import * as crypto from "crypto";
import { BigNumber, ethers } from "ethers";
import { Mailbox__factory, StorageGasOracle, StorageGasOracle__factory } from "@hyperlane-xyz/core"
import { deepEquals, strip0x } from '@hyperlane-xyz/utils';

interface RemoteGasDataConfig {
    tokenExchangeRate: BigNumber;
    gasPrice: BigNumber;
}

interface StorageGasOracleConfig {
    owner: string;
    remoteGasDataConfigs: Record<number, RemoteGasDataConfig>;
};

export function getSigner() {
    // This comes from `Pulumi.testing.yaml`
    const config = new pulumi.Config('anvil');
    const privateKey = config.require('privateKey');
    const provider = new ethers.providers.JsonRpcProvider(config.require('rpcUrl'));
    const signer = new ethers.Wallet(privateKey, provider);

    return signer;
}

// I imagine this would live in the SDK or something instead of here
class StorageGasOracleDeployer {
    constructor(private readonly signer: ethers.Signer) {}

    async deploy() {
        // @ts-ignore - I think my ethers versions are messed up
        const StorageGasOracle = new StorageGasOracle__factory(this.signer);
        const deployed = await StorageGasOracle.deploy();

        return deployed;
    }

    async configure(deployed: StorageGasOracle, newConfig: StorageGasOracleConfig, currentConfig?: StorageGasOracleConfig) {
        const current = currentConfig ?? await this.read(deployed, newConfig);

        // TODO should use the real type expected by the contract
        const newRemoteGasDataConfigs: any = [];
        for (const [remoteDomain, currentGasData] of Object.entries(current.remoteGasDataConfigs)) {
            const domain = Number(remoteDomain);
            const newGasData = newConfig.remoteGasDataConfigs[domain];

            // Feels like there's some version incompat with my ethers types, so I'm just using
            // deepEquals instead of BigNumber.eq
            if (!deepEquals(currentGasData.gasPrice, newGasData.gasPrice) || !deepEquals(currentGasData.tokenExchangeRate, newGasData.tokenExchangeRate)) {
                newRemoteGasDataConfigs.push({
                    remoteDomain: domain,
                    ...newGasData,
                });
            }
        }

        // If any domains are removed, we need to zero out the gas data
        for (const [remoteDomain, _] of Object.entries(current.remoteGasDataConfigs)) {
            const domain = Number(remoteDomain);
            if (!newConfig.remoteGasDataConfigs[domain]) {
                newRemoteGasDataConfigs.push({
                    remoteDomain: domain,
                    gasPrice: BigNumber.from(0),
                    tokenExchangeRate: BigNumber.from(0),
                });
            }
        }

        if (newRemoteGasDataConfigs.length > 0) {
            console.log('Setting remote gas data configs:', newRemoteGasDataConfigs);
            await deployed.setRemoteGasDataConfigs(newRemoteGasDataConfigs);
        }

        if (current.owner !== newConfig.owner) {
            console.log('Transfering ownership from', current.owner, 'to', newConfig.owner);
            await deployed.transferOwnership(newConfig.owner);
        }
    }

    async read(deployed: StorageGasOracle, config: StorageGasOracleConfig): Promise<StorageGasOracleConfig> {
        const owner = await deployed.owner();

        const remoteGasDataConfigs: Record<number, RemoteGasDataConfig> = {};

        for (const [remoteDomain, gasData] of Object.entries(config.remoteGasDataConfigs)) {
            const [existingTokenExchangeRate, existingGasPrice] = await deployed.remoteGasData(remoteDomain);

            remoteGasDataConfigs[Number(remoteDomain)] = {
                tokenExchangeRate: existingTokenExchangeRate,
                gasPrice: existingGasPrice,
            };
        }

        return { owner, remoteGasDataConfigs };
    }
}

// This is the crux of it - all this does is provide an interface for CRUD operations
const storageGasOracleProvider: pulumi.dynamic.ResourceProvider<StorageGasOracleConfig, StorageGasOracleConfig> = {
    async create(inputs: StorageGasOracleConfig) {

        const signer = getSigner();

        const deployer = new StorageGasOracleDeployer(signer);
        const deployed = await deployer.deploy();
        await deployer.configure(deployed, inputs);
        
        return { id: deployed.address, outs: inputs };
    },

    async update(id, olds, news) {
        const signer = getSigner();
        const deployer = new StorageGasOracleDeployer(signer);
        deployer.configure(StorageGasOracle__factory.connect(id, signer), news, olds);

        return { outs: { ...olds, ...news}};
    },

    async diff(_id, olds, news) {
        return {
            changes: !deepEquals(olds, news),
        };
    },

    async read(id, props?: StorageGasOracleConfig) {
        const signer = getSigner();
        const deployer = new StorageGasOracleDeployer(signer);
        return { id, props: await deployer.read(StorageGasOracle__factory.connect(id, signer), props!) };
    },
}

export class StorageGasOracleResource extends pulumi.dynamic.Resource {
    constructor(name: string, inputs: StorageGasOracleConfig, opts?: pulumi.CustomResourceOptions) {
        super(storageGasOracleProvider, name, inputs, opts);
    }
}
