FORM_95_WIDTH = 58.5
FORM_95_LENGTH = 79.625
FORM_95_AREA = FORM_95_WIDTH * FORM_95_LENGTH
PRINT_95_FORM_LENGTH = 80.625  # used for print form cost calculation

BUSMARK_FORM_WIDTH = 61
BUSMARK_FORM_LENGTH = 84
BUSMARK_PRINT_FORM_LENGTH = 85 # used for print form cost calculation
BUSMARK_ROLL_LENGTH = 1800
BUSMARK_FORM_AREA = BUSMARK_FORM_WIDTH * BUSMARK_FORM_LENGTH
BUSMARK_PADDING = 180

PADDING = 0

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
