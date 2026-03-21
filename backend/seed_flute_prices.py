import csv
import os
import re
from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi
from datetime import datetime

uri = "mongodb+srv://moa_db_user:eLwet5UCmRc9vtoE@moa-db.vfpnpqb.mongodb.net/?appName=MOA-DB"

client = MongoClient(uri, server_api=ServerApi('1'))
db = client["DB"]
collection = db["flute-prices"]

CSV_PATH = os.path.join(os.path.dirname(__file__), "corrugate.csv")

def parse_price(raw: str) -> float:
    """Strip $ and whitespace, return float."""
    return float(re.sub(r"[^\d.]", "", raw.strip()))

inserted_count = 0
updated_count = 0

with open(CSV_PATH, newline="", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    for row in reader:
        record = {
            "item_id":          row["ITEM ID"].strip(),
            "description":      row["ITEM DESCRIPTION"].strip(),
            "category":         row["CATEGORY"].strip(),
            "uom":              row["UOM (C)"].strip(),
            "unit_cost":        parse_price(row["UNIT COST (C)"]),
            "last_updated":     datetime.utcnow(),
            "updated_by":       "seed_script",
        }

        result = collection.update_one(
            {"item_id": record["item_id"]},  # unique key — match on item ID
            {"$set": record},
            upsert=True
        )

        if result.upserted_id:
            inserted_count += 1
            status = "inserted"
        else:
            updated_count += 1
            status = "updated"

        print(f"[{status}] {record['item_id']} | {record['description']} | ${record['unit_cost']}")

print(f"\nDone. {inserted_count} inserted, {updated_count} updated.")
client.close()
