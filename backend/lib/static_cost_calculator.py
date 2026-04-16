import math
from enum import Enum

from lib.classes import Complexity, Element, Form, Project
from lib.db import MOADB

STANDEE_MAP = {
    Complexity.SIMPLE: "Simple Standee",
    Complexity.MODERATE: "Moderate Standee",
    Complexity.COMPLEX: "Complex Standee",
}


def static_cost_calculator(
    print_forms: list[Form],
    num_standees: int,
    standee_type: Complexity,
    print_form_material: str,
    blank_comp_count: int = 0,
    colour_comp_count: int = 0,
    cutting_die_given_linear_inches: int = 0
):
    db = MOADB()
    # per form cost
    # blank form calculation
    print_forms_per_standee = len(print_forms)
    # currently maxes at 10. need to account for if theres more than 10 forms per standee
    blank_form_ratio = db.get_print_blank_ratio(print_forms_per_standee)
    blank_forms_per_standee = math.ceil(blank_form_ratio * print_forms_per_standee)
    total_num_print_forms = print_forms_per_standee * num_standees
    total_blank_forms = blank_forms_per_standee * num_standees
    total_forms = total_blank_forms + total_num_print_forms
    # corrugate cost calculation
    corrugate_cost = db.get_corrugate_cost() * total_forms
    # print form material cost calculation (TODO)
    # imposition cost
    imposition_rate = db.get_standee_data(STANDEE_MAP[standee_type], "imposition_cost_per_hour")
    print(imposition_rate)
    impositon_cost = imposition_rate * print_forms_per_standee
    # zund cutting cost
    zund_hours = (
        db.get_standee_data(STANDEE_MAP[standee_type], "zund_print_form_minutes")
        * print_forms_per_standee
        * num_standees
    ) / 60
    zund_cut_cost = zund_hours * db.get_standee_data(STANDEE_MAP[standee_type], "zund_cost_per_hour")
    # die creation cost
    die_complexity_map = {
        complexity: (
            db.get_standee_data(term, "cutting_die_given_linear_inches_multiplier"),
            cutting_die_given_linear_inches
        )
        for complexity, term in STANDEE_MAP.items()
    }
    die_cost = 0
    for form in print_forms:
        die_cost += form.get_die_cost(die_complexity_map)
    # pallet cost
    pallet_cost = (
        db.get_pallet_labor_cost() * print_forms_per_standee + db.get_pallet_cost() * print_forms_per_standee
    )

    # per standee cost
    hardware_cost = db.get_standee_data(STANDEE_MAP[standee_type], "hardware_cost") * num_standees
    shipper_box_cost = db.get_shipper_box_cost() * num_standees
    desc_label_cost = db.get_label_cost("Description")
    handling_label_cost = db.get_label_cost("Shipping")
    label_cost = (2 * desc_label_cost + handling_label_cost) * num_standees
    # instruction sheet cost
    instruction_sheet_cost = (
        db.get_standee_data(STANDEE_MAP[standee_type], "instruction_sheet_total_cost") * num_standees
    )
    # freight cost
    freight_assembly = db.get_freight_cost(1) * num_standees
    freight_mount_assembly = db.get_freight_cost(2) * num_standees
    # per project cost
    # comp cost
    blank_comp_cost = db.get_comp_cost("Blank") * blank_comp_count
    colour_comp_cost = db.get_comp_cost("Color") * colour_comp_count
    # engineering design cost
    engineering_design_cost = db.get_standee_data(
        STANDEE_MAP[standee_type], "engineering_design_cost_per_project"
    )


if __name__ == "__main__":
    print(static_cost_calculator([], 10, Complexity.SIMPLE, ""))