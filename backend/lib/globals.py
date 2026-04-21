FORM_WIDTH = 60.0
FORM_LENGTH = 80.0
PADDING = 0.25
FORM_AREA = FORM_WIDTH * FORM_LENGTH
SCENARIO_MAP = {
    1: "Internal Print / Internal Finishing / Packed Out (Box)",
    2: "Internal Print / Internal Finishing / Assembled",
    3: "Internal Print / Internal Finishing/External Assembly",
    4: "Internal Print / External Mount & Die Cut/External Assembly",
    5: "External Print / Finishing / Packout",
}

UNIT_MAP = {
    "linear_inch": 1.0,
    "linear_foot": 1 / 12,
    "thousand": 1 / 1000,
    "each": 1.0,
    "hour": 1.0,
}
