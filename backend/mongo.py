from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi

uri = "mongodb+srv://moa_db_user:eLwet5UCmRc9vtoE@moa-db.vfpnpqb.mongodb.net/?appName=MOA-DB"

# Create a new client and connect to the server
client = MongoClient(uri, server_api=ServerApi('1'))

# Send a ping to confirm a successful connection
try:
    client.admin.command('ping')
    print("Pinged your deployment. You successfully connected to MongoDB!")
except Exception as e:
    print(e)

'''


31003	95# C1S Roll Stock 54" x 1250'	Text Paper-Coated	LNFT	 $ 0.19 
31004	95# C1S Roll Stock 60" x 1250'	Text Paper-Coated	LNFT	 $ 0.25 
31200	Vinyl, Adhesive, Busmark 5800, 62"x 300'	Lo-Tack Vinyl	LNFT	 $ 1.56 
31451	Mounting Adhesive, Hi Tack, Clear 61" x 150'	Adhesives	LNFT	 $ 2.23 
41000	Corrugate, 200# B, K 2/S, 80" x 115"	Corrugated	Sheet	 $ 8.50 
41001	Corrugate, 200# E, Black 1/S, 80" x 115"	Corrugated	Sheet	 $ 12.50 
41002	Corrugate, 200# B, #3 White 1/S, 80" x 115"	Corrugated	Sheet	 $ 9.70 
41003	Corrugate, 275# C, K 2/S, 70" x 80'	Corrugated	Sheet	 $ 7.65 
41005	Corrugate, 200# B, Black 1/S, 80" x 115"	Corrugated	Sheet	 $ 12.50 
41006	Corrugate, 200# E, White 1/S, 80" x 115"	Corrugated	Sheet	 $ 10.00 
41007	Corrugate, 200# B, K 2/S, 65" x 85"	Corrugated	Sheet	 $ 5.00 
41008	Corrugate, 200# B, K 2/S, 85" x 65"	Corrugated	Sheet	 $ 5.15 
41009	Corrugate, 200# B/C, D/W K , 80" x 115"	Corrugated	Sheet	 $ 13.15 
41010	Corrugate, 200# E, Black 1/S, 65" x 85"	Corrugated	Sheet	 $ 7.50 
41011	Corrugate, 200# B, #3 White 1/S, 65" x 85"	Corrugated	Sheet	 $ 6.20 
41012	Corrugate, 200# E, #3 White 1/S, 65" x 85"	Corrugated	Sheet	 $ 6.35 
41013	Corrugate, 200# B, Black 1/S, 65" x 85"	Corrugated	Sheet	 $ 7.40 
73214	Pallet, 82" x 60"	Wood Pallets	Each	 $ 125.00 

'''