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
    if(process.env.NODE_ENV==='development'){
      db = client.db("sukunlife-big")
    }else{
      db = client.db("sukunlife");
    }
    // switch to sukunlife for production.
    // db = client.db("sukunlife");
    await client.db("admin").command({ ping: 1 });
    return db;
  } catch (e) {
    console.error(e.message);
  }
};

export default dbConnect;
