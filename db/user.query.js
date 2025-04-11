const { getConnection, closeConnection } = require('./index');

module.exports.createUserLendingEvent = async (event) => {
    console.log('Creating user lending event:', event);
    let connection;
    try {
        connection = await getConnection();
        const result = await connection.query(
            `INSERT INTO user_pool_lending (address, eventname, assets, shares, timestamp, blocknumber, pool_id) 
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id`,
            { 
                bind: [
                    event.address, 
                    event.eventname, 
                    event.assets, 
                    event.shares, 
                    event.timestamp, 
                    event.blocknumber, 
                    event.pool_id
                ],
                type: 'INSERT'
            }
        );
        return result[0].id;
    } catch (error) {
        console.error('Error creating User lending event:', error);
        throw error;
    } finally {
        await closeConnection(connection);
    }
}

module.exports.createPoolAddress = async (poolAddress) => {
    let connection;
    try {
        connection = await getConnection();
        const result = await connection.query(
            `INSERT INTO pool_addresses (address) VALUES ($1) RETURNING id`,
            { 
                bind: [poolAddress],
                type: 'INSERT'
            }
        );
        return result[0].id;
    } catch (error) {
        console.error('Error creating pool address:', error);
        throw error;
    } finally {
        await closeConnection(connection);
    }
}

module.exports.getPoolIds = async () => {
    let connection;
    try {
        connection = await getConnection();
        const result = await connection.query(
            `SELECT id, address FROM pool_addresses`
        );
        return result[0];
    } catch (error) {
        console.error('Error getting pool ids:', error);
        throw error;
    } finally {
        await closeConnection(connection);
    }
}

module.exports.createLPTokenPriceEvent = async (event) => {
    let connection;
    try {
        connection = await getConnection();
        const result = await connection.query(
            `INSERT INTO pool_lp_tokens (pool_id, token_price, timestamp) 
            VALUES ($1, $2, $3)
            RETURNING id`,
            { 
                bind: [
                    event.pool_id, 
                    event.token_price, 
                    event.timestamp
                ],
                type: 'INSERT'
            }
        );
        return result[0].id;
    } catch (error) {
        console.error('Error creating LP token price event:', error);
        throw error;
    } finally {
        await closeConnection(connection);
    }
}