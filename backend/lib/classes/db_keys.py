from enum import StrEnum


class UnitCostKey(StrEnum):
    """Known keys in the ``unit_costs`` collection."""

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


class StandeeKey(StrEnum):
    """Known standee categories in the ``standee_static_costs`` collection."""

    SIMPLE = "Simple Standee"
    MODERATE = "Moderate Standee"
    COMPLEX = "Complex Standee"


class SupplierKey(StrEnum):
    """Known supplier/material keys used by the estimator."""

    B_WHITE = "b_white_1_s"
    BLANK = "bk"
    FOSTERS = "fosters"
    FOSTERS_PRINT_FORM = "fosters_print_form"
    PQ = "pq"
