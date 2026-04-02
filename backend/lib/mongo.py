from pprint import pprint

from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi

uri = "mongodb+srv://moa_db_user:eLwet5UCmRc9vtoE@moa-db.vfpnpqb.mongodb.net/?appName=MOA-DB"


class MOADB:
    """MongoDB helper for flute-price collection operations."""

    def __init__(self):
        self.uri = "mongodb+srv://moa_db_user:eLwet5UCmRc9vtoE@moa-db.vfpnpqb.mongodb.net/?appName=MOA-DB"
        self.client = client = MongoClient(self.uri, server_api=ServerApi("1"))
        self.db = client["DB"]
        self.collection = self.db["flute-prices"]

    def get_flute_names_and_ids(self):
        """Return unique sorted list of all flute item IDs in the collection."""
        return self.collection.find("item_id")

    def list_all_objects(self):
        """Return all documents in the collection with all properties."""
        return list(self.collection.find({}))


if __name__ == "__main__":
    db = MOADB()
    all_docs = db.list_all_objects()
    for doc in all_docs:
        pprint(doc)
