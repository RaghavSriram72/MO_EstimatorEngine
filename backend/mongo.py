from pprint import pprint
from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi

import os
from dotenv import load_dotenv
load_dotenv()  # Load environment variables from .env file

class MOADB :
    """MongoDB helper for flute-price collection operations."""

    def __init__(self):
        load_dotenv()  # Load environment variables from .env file

        self.uri  = os.getenv("MONGO_URI")
        self.client = client = MongoClient(self.uri, server_api=ServerApi('1'))
        self.db = client["DB"]
        self.collection = self.db["standee-fixed-costs"]

    def get_standee_data(self, standee_category: str, data_field: str):
        """Return the specified data field for a given standee category."""
        result = self.collection.find_one({"standee_type": standee_category})
        if result and data_field in result:
            return result[data_field]
        else:
            return None  # or raise an exception if preferred


if __name__ == "__main__":
    db = MOADB()
    print(db.get_standee_data("Simple Standee", "imposition_cost_per_hour"))
