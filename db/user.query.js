const { getConnection, closeConnection } = require('./index');

module.exports.createUserLendingEvent = async (event) => {
    let connection;
    try {
        connection = await getConnection();
        const result = await connection.query(
            `INSERT INTO user_pool_lending (address, eventname, assets, shares, timestamp, blocknumber, pool_id) 
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id`,
            [event.address, event.eventname, event.assets, event.shares, event.timestamp, event.blocknumber, event.pool_id]
        );
        return result[0].id;
    } catch (error) {
        console.error('Error creating User lending event:', error);
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