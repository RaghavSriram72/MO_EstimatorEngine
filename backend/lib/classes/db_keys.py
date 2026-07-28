from enum import StrEnum


class DBTables(StrEnum):
    OVERS = "overs"
    PRINT_BLANK = "print_blank_ratio"
    PROJECTS = "projects"
    STANDEE = "standee_static_costs"
    SUPPLIERS = "supplier_materials"
    UNIT_COSTS = "unit_costs"
    USERS = "users"
    QUOTES = "quotes"


class UnitCostEntries(StrEnum):
    """Known keys in the ``unit_costs`` table."""

    BLANK_COMP = "blank_comp"
    COLOR_COMP = "color_comp"
    CORRUGATE = "blank_corrugate"
    DIE_COST = "die_cost"
    FULL_OUT_SOURCE = "print_mount_diecut_assembly_kitting"
    EXTERNAL_MOUNT_ASSEMBLY = "mount_diecut_assembly_kitting"
    EXTERNAL_ASSEMBLY = "assembly_kitting"
    DESCRIPTION_LABEL = "description_label"
    SHIPPING_LABEL = "shipping_label"
    SHIPPING_BOX = "shipping_box"
    PALLET = "pallet"
    PALLET_LABOR = "pallet_labor"
    ROLL_95 = "roll_95_pound"
    SHEET_95 = "sheet_95_pound"
    ROLL_HI_TACK = "roll_hi_tack"
    ROLL_BUSMARK = "roll_busmark"
    IMPOSITION_LABOR = "imposition_labor"
    INSTRUCTION_SHEET = "instruction_sheet"
    ZUND_CUTTER = "zund_cutter"
    RHO_512R = "durst_rho_512R"
    RHO_1312 = "durst_rho_1312"
    ROLLX = "roll-x"


class StandeeData(StrEnum):
    TYPE = "standee_type"
    ENGINEERING_DESIGN_COST = "engineering_design_cost_per_project"
    INSTRUCTION_SHEET_ENGINEERING_COST = "instruction_sheet_engineering_cost_per_project"
    HARDWARE_COST = "hardware_cost"
    ZUND_PRINT_FORM_MINUTES = "zund_print_form_minutes"
    ZUND_BLANK_FORM_MINUTES = "zund_blank_form_minutes"
    INSTRUCTION_SHEET_TOTAL_COST = "instruction_sheet_total_cost"
    CUTTING_DIE_INCHES_MULTIPLIER = "cutting_die_inches_multiplier"
    KITTING_AND_ASSEMBLY = "kitting_and_assembly"
    CUTTING_DIE_BLANK_FORM_MIN = "cutting_die_blank_form_min"
    CUTTING_DIE_PRINT_FORM_MIN = "cutting_die_print_form_min"


class StandeeKey(StrEnum):
    """Known standee categories in the ``standee_static_costs`` table."""

    SIMPLE = "Simple Standee"
    MODERATE = "Moderate Standee"
    COMPLEX = "Complex Standee"


class Suppliers(StrEnum):
    """Known supplier/material keys used by the estimator."""

    FOSTERS = "fosters"
    PQ = "pq"


class SupplierMaterials(StrEnum):
    B_WHITE = "b_white_1_s"
    BLANK = "bk_blank_die"
    FOSTERS_PRINT_FORM = "fosters_print_form"
