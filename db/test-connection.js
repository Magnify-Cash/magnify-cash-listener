const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { getConnection, closeConnection } = require('./index');

async function testConnection() {
  let connection = null;
  try {
    console.log('Attempting to establish database connection...');
    console.log('Using DATABASE_URL:', process.env.DATABASE_URL ? '✅ Set' : '❌ Not set');
    connection = await getConnection();
    console.log('✅ Successfully connected to the database!');
    
    // Test a simple query
    const result = await connection.query('SELECT NOW() as current_time');
    console.log('✅ Successfully executed test query');
    console.log('Current database time:', result[0][0].current_time);
    
    return true;
  } catch (error) {
    console.log(error);
    console.error('❌ Connection test failed:', error.message);
    return false;
  } finally {
    if (connection) {
      await closeConnection(connection);
      console.log('Database connection closed');
    }
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testConnection()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Unexpected error:', error);
      process.exit(1);
    });
}

module.exports = testConnection; 