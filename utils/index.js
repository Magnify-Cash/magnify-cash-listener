const { createPublicClient, http } = require('viem');
const { worldchain } = require('viem/chains');
const WORLDCHAIN_RPC_URL = process.env.WORLDCHAIN_RPC_URL;

module.exports.initPublicClient = async (rpcUrl) => {
    const client = createPublicClient({
        chain: worldchain,
        transport: http(rpcUrl),
    });
    return client;
} 

module.exports.serializeBigInt = function(obj) {
    if (obj === null || obj === undefined) {
        return obj;
    }
    
    if (typeof obj === 'bigint') {
        return obj.toString();
    }
    
    if (Array.isArray(obj)) {
        return obj.map(serializeBigInt);
    }
    
    if (typeof obj === 'object') {
        const result = {};
        for (const key in obj) {
            result[key] = serializeBigInt(obj[key]);
        }
        return result;
    }
    
    return obj;
}

module.exports.getBlockTimestamp = async (blockNumber) => {
    const client = await this.initPublicClient(WORLDCHAIN_RPC_URL);
    const block = await client.getBlock({ blockNumber: BigInt(blockNumber) });
    return block.timestamp;
}