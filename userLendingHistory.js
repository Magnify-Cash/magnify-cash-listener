const { createPublicClient, webSocket } = require("viem");
const { worldchain } = require('viem/chains')
const MagnifyV3Abi = require('./contracts/MagnifyV3.json');
const { getPoolIds } = require("./db/user.query");
const { serializeBigInt, getBlockTimestamp, getPoolAddresses } = require('./utils');
const { createUserLendingEvent } = require('./db/user.query');

// Cache for failed events
const failedEvents = [];

// Cache for pool IDs
let poolIdsCache = null;
let lastPoolIdsRefresh = 0;
const POOL_IDS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Cache for pool addresses
let poolAddressesCache = null;
let lastPoolAddressesRefresh = 0;
const POOL_ADDRESSES_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Function to get pool addresses with caching
const getCachedPoolAddresses = async () => {
    const now = Date.now();
    if (!poolAddressesCache || (now - lastPoolAddressesRefresh) > POOL_ADDRESSES_CACHE_TTL) {
        poolAddressesCache = await getPoolAddresses();
        lastPoolAddressesRefresh = now;
        console.log('Pool addresses cache refreshed');
    }
    return poolAddressesCache;
};

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

// Initialize pool addresses
let poolAddresses = [];
getCachedPoolAddresses().then(addresses => {
    poolAddresses = addresses;
    console.log('Initial pool addresses loaded:', poolAddresses);
});

// Set up event listeners for all pools and events
const setupEventListeners = async () => {
    const eventListeners = [];
    const poolAddresses = await getCachedPoolAddresses();
    console.log('Setting up event listeners for pools:', poolAddresses);

    // Create listeners for each pool and event type
    for (const poolAddress of poolAddresses) {
        console.log(`Setting up event listeners for pool: ${poolAddress}`);
        // Deposit event listener
        const depositListener = client.watchContractEvent({
            address: poolAddress,
            abi: MagnifyV3Abi,
            eventName: 'Deposit',
            onLogs: (logs) => {
                console.log(logs);
                console.log(`Received Deposit event for pool ${poolAddress}`);
                handleEventLogs('Deposit', poolAddress, logs);
            }
        });
        eventListeners.push(depositListener);

        // Withdraw event listener
        const withdrawListener = client.watchContractEvent({
            address: poolAddress,
            abi: MagnifyV3Abi,
            eventName: 'Withdraw',
            onLogs: (logs) => {
                console.log(logs);
                handleEventLogs('Withdraw', poolAddress, logs);
            }
        });
        eventListeners.push(withdrawListener);
    }

    // Start all event listeners in parallel
    await Promise.all(eventListeners);
    console.log('All event listeners are active and waiting for events');
};

// Initialize and start the application
const startApplication = async () => {
    try {
        await setupEventListeners();
        console.log('Application started successfully');
    } catch (error) {
        console.error('Failed to start application:', error);
    }
};

// Start the application
startApplication();

// Set up periodic refresh of pool addresses (every 24 hours)
setInterval(async () => {
    const newAddresses = await getCachedPoolAddresses();
    if (JSON.stringify(newAddresses) !== JSON.stringify(poolAddresses)) {
        console.log('Pool addresses changed, restarting event listeners...');
        await setupEventListeners();
    }
}, POOL_ADDRESSES_CACHE_TTL);

const client = createPublicClient({
    chain: worldchain,
    transport: webSocket(process.env.WORLDCHAIN_SOCKET_URL)
});

// Function to handle event logs
const handleEventLogs = async (eventName, poolAddress, logs) => {
    let data;
    try {
        console.log(`Event: ${eventName} from pool: ${poolAddress}`);
        const event = logs[0];
        const pools = await getCachedPoolIds();
        const poolId = pools.find(pool => pool.address.toLowerCase() === poolAddress.toLowerCase());
        const timestamp = await getBlockTimestamp(event.blockNumber);
        const date = new Date(Number(timestamp) * 1000).toISOString();
        data = {
            address: event.args.sender.toLowerCase(),
            eventname: event.eventName,
            assets: event.args.assets.toString(),
            shares: event.args.shares.toString(),
            timestamp: date,
            blocknumber: event.blockNumber.toString(),
            pool_id: poolId.id
        }
        console.log('Saving event data:', data);
        try {
            console.log('Attempting to save to database...');
            const result = await createUserLendingEvent(data);
            console.log('Successfully saved event with ID:', result);
        } catch (dbError) {
            console.error('Database error:', dbError);
            throw dbError;
        }
    } catch (error) {
        console.error(`Error: ${error}`);
        // Store the failed event data in cache
        failedEvents.push(data);
        console.log('Event stored in retry cache. Current failed events:', failedEvents.length);
    }
};










