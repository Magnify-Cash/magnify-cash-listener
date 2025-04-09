const { createPublicClient, webSocket } = require("viem");
const { worldchain } = require('viem/chains')
const MagnifyV3Abi = require('./contracts/MagnifyV3.json');
const { getPoolIds } = require("./db/user.query");
const { serializeBigInt, getBlockTimestamp } = require('./utils');

// Cache for failed events
const failedEvents = [];

// Cache for pool IDs
let poolIdsCache = null;
let lastPoolIdsRefresh = 0;
const POOL_IDS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Function to get pool IDs with caching
const getCachedPoolIds = async () => {
    const now = Date.now();
    if (!poolIdsCache || (now - lastPoolIdsRefresh) > POOL_IDS_CACHE_TTL) {
        poolIdsCache = await getPoolIds();
        lastPoolIdsRefresh = now;
        console.log('Pool IDs cache refreshed');
    }
    return poolIdsCache;
};

// Function to retry failed events
const retryFailedEvents = async () => {
    while (failedEvents.length > 0) {
        const event = failedEvents.shift();
        try {
            await createUserLendingEvent(event);
            console.log('Successfully retried failed event');
        } catch (error) {
            console.error('Failed to retry event:', error);
            // Put it back at the end of the queue
            failedEvents.push(event);
            break; // Stop retrying if we hit an error
        }
    }
};

// Set up periodic retry of failed events (every 5 minutes)
setInterval(retryFailedEvents, 5 * 60 * 1000);

const poolAddresses = [
    '0x75e0b3e2c5de6abeb77c3e0e143d8e6158daf4d5',
    '0x6d92a3aaadf838ed13cb8697eb9d35fcf6c4dba9'
];

const client = createPublicClient({
    chain: worldchain,
    transport: webSocket(process.env.WORLDCHAIN_SOCKET_URL)
});

// Function to handle event logs
const handleEventLogs = (eventName, poolAddress) => async (logs) => {
    let data;
    try {
        console.log(`Event: ${eventName} from pool: ${poolAddress}`);
        const event = logs[0];
        const pools = await getCachedPoolIds();
        const poolId = pools.find(pool => pool.address === poolAddress);
        const timestamp = await getBlockTimestamp(event.blockNumber);
        const date = new Date(timestamp * 1000).toISOString();
        data = {
            address: event.args.sender,
            eventname: event.eventName,
            assets: serializeBigInt(event.args.assets),
            shares: serializeBigInt(event.args.shares),
            timestamp: date,
            blocknumber: serializeBigInt(event.blockNumber),
            pool_id: poolId.id
        }
        await createUserLendingEvent(data);
    } catch (error) {
        console.error(`Error: ${error}`);
        // Store the failed event data in cache
        const serializedData = {
            ...data,
            assets: serializeBigInt(data.assets),
            shares: serializeBigInt(data.shares)
        };
        failedEvents.push(serializedData);
        console.log('Event stored in retry cache. Current failed events:', failedEvents.length);
    }
};

// Set up event listeners for all pools and events
const setupEventListeners = async () => {
    const eventListeners = [];

    // Create listeners for each pool and event type
    for (const poolAddress of poolAddresses) {
        // Deposit event listener
        eventListeners.push(
            client.watchContractEvent({
                address: poolAddress,
                abi: MagnifyV3Abi,
                eventName: 'Deposit',
                onLogs: handleEventLogs('Deposit', poolAddress)
            })
        );

        // Withdraw event listener
        eventListeners.push(
            client.watchContractEvent({
                address: poolAddress,
                abi: MagnifyV3Abi,
                eventName: 'Withdraw',
                onLogs: handleEventLogs('Withdraw', poolAddress)
            })
        );
    }

    // Start all event listeners in parallel
    await Promise.all(eventListeners);
    console.log('All event listeners are active');
};

// Start the event listeners
setupEventListeners().catch(console.error);










