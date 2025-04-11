const { createPublicClient, webSocket } = require("viem");
const { worldchain } = require('viem/chains')
const MagnifyV3Abi = require('./contracts/MagnifyV3.json');
const { getPoolIds } = require("./db/user.query");
const { serializeBigInt, getBlockTimestamp, getPoolAddresses } = require('./utils');
const { createUserLoanEvent } = require('./db/user.query');

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
            await createUserLoanEvent(event);
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
        
        // LoanRequested event listener
        const loanRequestedListener = client.watchContractEvent({
            address: poolAddress,
            abi: MagnifyV3Abi,
            eventName: 'LoanRequested',
            onLogs: (logs) => {
                console.log(logs);
                console.log(`Received LoanRequested event for pool ${poolAddress}`);
                handleEventLogs('LoanRequested', poolAddress, logs);
            }
        });
        eventListeners.push(loanRequestedListener);

        // LoanRepaid event listener
        const loanRepaidListener = client.watchContractEvent({
            address: poolAddress,
            abi: MagnifyV3Abi,
            eventName: 'LoanRepaid',
            onLogs: (logs) => {
                console.log(logs);
                console.log(`Received LoanRepaid event for pool ${poolAddress}`);
                handleEventLogs('LoanRepaid', poolAddress, logs);
            }
        });
        eventListeners.push(loanRepaidListener);
        // Loan Defaulted event listener
        const loanDefaultedListener = client.watchContractEvent({
            address: poolAddress,
            abi: MagnifyV3Abi,
            eventName: 'LoanDefaulted',
            onLogs: (logs) => {
                console.log(logs);
                console.log(`Received LoanRepaid event for pool ${poolAddress}`);
                handleEventLogs('LoanRepaid', poolAddress, logs);
            }
        });
        eventListeners.push(loanDefaultedListener);
        // Loan Default repaid event listener
        const loanDefaultRepaidListener = client.watchContractEvent({
            address: poolAddress,
            abi: MagnifyV3Abi,
            eventName: 'LoanDefaultRepaid',
            onLogs: (logs) => {
                console.log(logs);
                console.log(`Received LoanDefaultRepaid event for pool ${poolAddress}`);
                handleEventLogs('LoanDefaultRepaid', poolAddress, logs);
            }
        });
        eventListeners.push(loanDefaultRepaidListener);
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
        const price = await client.readContract({
            address: poolAddress,
            abi: MagnifyV3Abi,
            functionName: 'previewRedeem',
            args: [1_000_000n]
        });
        const timestamp = Math.floor(Date.now() / 1000);
        const pools = await getCachedPoolIds();
        const poolId = pools.find(pool => pool.address.toLowerCase() === poolAddress.toLowerCase());
        data = {
            pool_id: poolId.id,
            token_price: serializeBigInt(price) / 1_000_000,
            timestamp: timestamp
        }
        try {
            console.log('Attempting to save to database...');
            const result = await createLPTokenPriceEvent(data);
            console.log('Successfully saved LP token price for pool:', data);
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
