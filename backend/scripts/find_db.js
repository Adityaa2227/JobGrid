const { MongoClient } = require('mongodb');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function run() {
    const uri = process.env.MONGO_URI;
    console.log('Connecting to:', uri.replace(/:([^@]+)@/, ':***@'));
    
    const client = new MongoClient(uri);
    await client.connect();
    
    // List all databases
    const adminDb = client.db().admin();
    const { databases } = await adminDb.listDatabases();
    
    console.log('\n=== Available Databases ===');
    for (const db of databases) {
        console.log(`  - ${db.name} (${(db.sizeOnDisk / 1024 / 1024).toFixed(2)} MB)`);
        
        // Check each DB for users collection
        const collections = await client.db(db.name).listCollections().toArray();
        const colNames = collections.map(c => c.name);
        
        if (colNames.includes('users')) {
            const count = await client.db(db.name).collection('users').countDocuments();
            console.log(`    ✅ has 'users' collection → ${count} users`);
        }
        if (colNames.includes('jobs')) {
            const count = await client.db(db.name).collection('jobs').countDocuments();
            console.log(`    ✅ has 'jobs' collection  → ${count} jobs`);
        }
    }
    
    await client.close();
}

run().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
