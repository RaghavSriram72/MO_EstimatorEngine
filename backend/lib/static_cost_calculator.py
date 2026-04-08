import math

from lib.db import MOADB
from lib.print_form_calculator import Form


def fixed_cost_calcualtor(print_forms: list[Form], num_standees: int, standee_type: int, internal=True):
    db = MOADB()
    standee_map = {1: "Simple Standee", 2: "Moderate Standee", 3: "Complex Standee"}
    total_num_print_forms = len(print_forms)
    print_forms_per_standee = total_num_print_forms // num_standees
    blank_form_ratio = db.get_print_blank_ratio(print_forms_per_standee)
    blank_forms_per_standee = math.ceil(blank_form_ratio * print_forms_per_standee)
    standee_type_str = standee_map.get(standee_type, "Unknown Standee Type")

    blank_forms = print_forms * 1.5

    imposition_cost = print_forms * 55

    comp_cost = blank_forms * db.get_comp_cost("Blank") + print_forms * db.get_comp_cost("Colour")

    engineering_design = db.get_standee_data(standee_type_str, "engineering_design_cost_per_project")
    instruction_sheet = db.get_standee_data(
        standee_type_str, "instruction_sheet_engineering_cost_per_project"
    ) + db.get_standee_data(standee_type_str, "instruction_sheet_total_cost")

    corrugate_cost = db.get_corrugate_cost() * (blank_forms + print_forms)

    hardware_cost = db.get_standee_data(standee_type_str, "hardware_cost")

    zund_cost_print = math.ceil(
        (db.get_standee_data(standee_type_str, "zund_print_form_minutes") * print_forms) / 60
    )

    zund_cost_blank = math.ceil(
        (db.get_standee_data(standee_type_str, "zund_blank_form_minutes") * blank_forms) / 60
    )

    zund_cost = zund_cost_print + zund_cost_blank * db.get_standee_data(
        standee_type_str, "zund_cost_per_hour"
    )

    die_cost_print = db.get_standee_data(standee_type_str, "cutting_die_print_form_cost") * print_forms
    die_cost_blank = db.get_standee_data(standee_type_str, "cutting_die_blank_form_cost") * blank_forms

    return "ur mom"