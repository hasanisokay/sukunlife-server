import { MongoClient, ServerApiVersion } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

// ============================================================================
// CACHE CONNECTION (SINGLETON PATTERN)
// ============================================================================
let cachedClient = null;
let cachedDb = null;

const dbConnect = async () => {
  const uri = process.env.MONGO_URI;

  // Return cached connection if it exists
  if (cachedClient && cachedDb) {
    return cachedDb;
  }

  try {
    // Create new MongoDB client
    const client = new MongoClient(uri, {
      serverApi: {
        version: ServerApiVersion.v1,
        deprecationErrors: true,
      },
      maxPoolSize: 10, // Maximum connection pool size
      minPoolSize: 2,  // Minimum connection pool size
      maxIdleTimeMS: 30000, // Close idle connections after 30s
      serverSelectionTimeoutMS: 5000, // Timeout for server selection
      socketTimeoutMS: 45000, // Socket timeout
    });

    // Connect to MongoDB
    await client.connect();

    // Select database based on environment
    let db;
    if (process.env.NODE_ENV === 'development') {
      db = client.db("sukunlife-big");
      console.log('✓ Connected to MongoDB (Development DB: sukunlife-big)');
    } else {
      db = client.db("sukunlife");
      console.log('✓ Connected to MongoDB (Production DB: sukunlife)');
    }

    // Ping to verify connection
    await client.db("admin").command({ ping: 1 });
    console.log('✓ MongoDB ping successful');

    // Cache the connection
    cachedClient = client;
    cachedDb = db;

    return db;

  } catch (error) {
    console.error('✗ MongoDB connection error:', error.message);
    throw error;
  }
};

// ============================================================================
// GRACEFUL SHUTDOWN - Close MongoDB connection
// ============================================================================
const closeConnection = async () => {
  if (cachedClient) {
    try {
      await cachedClient.close();
      cachedClient = null;
      cachedDb = null;
      console.log('✓ MongoDB connection closed');
    } catch (error) {
      console.error('✗ Error closing MongoDB connection:', error);
      throw error;
    }
  }
};

// ============================================================================
// GET CLIENT (for transactions if needed)
// ============================================================================
const getClient = () => {
  if (!cachedClient) {
    throw new Error('Database not connected. Call dbConnect() first.');
  }
  return cachedClient;
};

export default dbConnect;
export { closeConnection, getClient };