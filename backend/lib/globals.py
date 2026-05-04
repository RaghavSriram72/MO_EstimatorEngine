FORM_WIDTH = 60.0
FORM_LENGTH = 80.0
PRINT_FORM_LENGTH = 85.0 # used for print form cost calculation
PADDING = 0.25
BUSMARK_PADDING = 180 # used for busmark padding in print form cost calculation
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

DB_LABELS = {
    "die_cost": "die_cost",
    "blank_comp": "blank_comp",
    "color_comp": "color_comp",
    "corrugate": "blank_corrugate",
    "full_out_source": "print_mount_diecut_assembly_kitting",
    "external_mount_assembly": "mount_diecut_assembly_kitting",
    "external_assembly": "assembly_kitting",
    "desc_label": "description_label",
    "shipping_label": "shipping_label",
    "shipping_box": "shipping_box",
    "pallet": "pallet",
    "pallet_labor": "pallet_labor",
    "roll_95": "roll_95_pound",
    "sheet_95": "sheet_95_pound",
    "roll_hi_tack": "roll_hi_tack",
    "roll_busmark": "roll_busmark",
    "imposition_labor": "imposition_labor",
    "instruction_sheet": "instruction_sheet",
    "zund_cutter": "zund_cutter",
    "rho_512R": "durst_rho_512R",
    "rho_1312": "durst_rho_1312",
    "rollx": "roll-x",
    "b_white": "b_white_1_s",
    "fosters_print_form": "fosters_print_form",
    "fosters": "fosters",
    "pq": "pq",
}
