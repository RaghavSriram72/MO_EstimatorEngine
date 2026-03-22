from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# Configure CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi

import os
from dotenv import load_dotenv



# Create a new client and connect to the server




class MOADB :
    """MongoDB helper for flute-price collection operations."""

    def __init__(self):
        self.uri  = "mongodb+srv://moa_db_user:eLwet5UCmRc9vtoE@moa-db.vfpnpqb.mongodb.net/?appName=MOA-DB"
        self.client = client = MongoClient(self.uri, server_api=ServerApi('1'))
        self.db = client["DB"]
        self.collection = self.db["flute-prices"]

    def get_flute_names_and_ids(self):
        """Return all flute records as JSON-safe dictionaries."""
        return list(self.collection.find({}, {"_id": 0}))

    def list_all_objects(self):
        """Return all documents in the collection with all properties."""
        return list(self.collection.find({}))


@app.get("/")
async def root():
    return {"message": "Hello from FastAPI"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}




@app.get("/flute-data")
async def get_flute_data():
    db = MOADB()
    flute_data = db.get_flute_names_and_ids()
    return {"flute_data": flute_data}

