import { MongoClient, ServerApiVersion } from "mongodb";
import dotenv from "dotenv";
dotenv.config();
const dbConnect = async () => {
  const uri = process.env.MONGO_URI;
  let db;

  if (db) return db;
  try {
    const client = new MongoClient(uri, {
      serverApi: {
        version: ServerApiVersion.v1,
        // strict: true,
        deprecationErrors: true,
      },
    });
    db = client.db("sukunlife-big");
    // switch to sukunlife big for production.
    // db = client.db("sukunlife");
    await client.db("admin").command({ ping: 1 });
    return db;
  } catch (e) {
    console.error(e.message);
  }
};

export default dbConnect;
