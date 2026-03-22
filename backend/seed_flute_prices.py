import csv
import os

from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi

uri = "mongodb+srv://moa_db_user:eLwet5UCmRc9vtoE@moa-db.vfpnpqb.mongodb.net/?appName=MOA-DB"

client = MongoClient(uri, server_api=ServerApi('1'))
db = client["DB"]
collection = db["flute-prices"]

CSV_PATH = os.path.join(os.path.dirname(__file__), "corrugate.csv")

inserted_count = 0
updated_count = 0
not_found_count = 0

with open(CSV_PATH, newline="", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    for row in reader:
        item_id = row["ITEM ID"].strip()
        description = row["ITEM DESCRIPTION"].strip()

        result = collection.update_one(
            {"item_id": item_id},
            {"$set": {"description": description}},
            upsert=False
        )

        if result.matched_count == 0:
            not_found_count += 1
            status = "not_found"
        elif result.modified_count > 0:
            updated_count += 1
            status = "updated"
        else:
            status = "unchanged"

        print(f"[{status}] {item_id} | {description}")

print(f"\nDone. {updated_count} updated, {not_found_count} not found.")
client.close()
