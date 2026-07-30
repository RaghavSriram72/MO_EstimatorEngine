# Estimate IDs shown in the UI (#10100, #10101, …) — allocated sequentially in MidnightOilDB.
PROJECT_SHORT_ID_START = 10100

# ceil((85*Standee * Print Forms) / 3600 )

FORM_95_WIDTH = 58.5
FORM_95_LENGTH = 79.625
FORM_95_AREA = FORM_95_WIDTH * FORM_95_LENGTH
PRINT_95_FORM_LENGTH = 82  # used for print form cost calculation

BUSMARK_FORM_WIDTH = 61
BUSMARK_FORM_LENGTH = 84
BUSMARK_PRINT_FORM_LENGTH = 85 # used for print form cost calculation
BUSMARK_ROLL_LENGTH = 3600
BUSMARK_FORM_AREA = BUSMARK_FORM_WIDTH * BUSMARK_FORM_LENGTH
BUSMARK_PADDING = 180

PADDING = 0

SCENARIO_MAP = {
    1: "Internal Print / Internal Finishing / Packed Out (Box)",
    # Scenario 2 disabled — no longer offered as a quote scenario.
    # 2: "Internal Print / Internal Finishing / Assembled",
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
