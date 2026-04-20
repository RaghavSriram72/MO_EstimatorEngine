from lib.classes import Complexity, Form
from lib.db import MOADB

DIE_COST = "die_cost"
BLANK_COMP = "blank_comp"
COLOR_COMP = "color_comp"
CORRUGATE = "blank_corrugate"
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


class Project:
    """Class to represent a overall standee project."""

    def __init__(
        self,
        name: str,
        print_forms: list[Form],
        num_standees: int,
        standee_type: Complexity,
        print_form_material: str,
        blank_comp_count: int = 0,
        color_comp_count: int = 0,
        full_out_source: bool = False,
        partial_out_source: bool = False,
        inhouse: bool = True,
    ):
        self.STANDEE_MAP = {
            Complexity.SIMPLE: "Simple Standee",
            Complexity.MODERATE: "Moderate Standee",
            Complexity.COMPLEX: "Complex Standee",
        }
        self.standee_type = standee_type
        self.name = name
        self.print_forms = print_forms
        self.num_standees = num_standees
        self.inhouse = inhouse
        self.print_form_material = print_form_material

        self.print_forms_per_standee = len(print_forms)
        self.print_form_total = self.print_forms_per_standee * self.num_standees
        self.blank_comp_count = blank_comp_count
        self.color_comp_count = color_comp_count

        # DB-dependent fields: set during calculate_static_costs()
        self.blank_form_ratio = None
        self.blank_forms_per_standee = None
        self.blank_form_total = None
        self.total_forms = None
        self.print_form_cost = None
        self.corrugate_cost = None
        self.imposition_rate = None
        self.imposition_cost = None
        self.zund_hours = None
        self.zund_cut_cost = None
        self.die_cost = None
        self.pallet_count = self.print_forms_per_standee
        self.pallet_cost = None
        self.hardware_cost = None
        self.shipping_box_cost = None
        self.label_cost = None
        self.instruction_sheet_cost = None
        self.freight_assembly_cost = None
        self.freight_mount_assembly_cost = None
        self.blank_comp_cost = None
        self.color_comp_cost = None
        self.engineering_design_cost = None

    def calculate_static_costs(self, scenario: int) -> None:
        """Calculate static costs for a project based on the print forms, number of standees, and standee type."""
        # SCENARIO_MAP = {
        #     1: "Internal Print / Internal Finishing / Packed Out (Box)",
        #     2: "Internal Print / Internal Finishing / Assembled",
        #     3: "Internal Print / Internal Finishing/External Assembly",
        #     4: "Internal Print / External Mount & Die Cut/External Assembly",
        #     5: "External Print / Finishing / Packout",
        # }
        db = MOADB()
        standee_key = self.STANDEE_MAP[self.standee_type]

        self.blank_form_ratio = db.get_print_blank_ratio(self.print_forms_per_standee)
        self.blank_forms_per_standee = self.blank_form_ratio * self.print_forms_per_standee
        self.blank_form_total = self.blank_forms_per_standee * self.num_standees
        self.total_forms = self.blank_form_total + self.print_form_total

        self.corrugate_cost = db.get_unit_cost(CORRUGATE) * self.total_forms

        self.imposition_rate = db.get_standee_data(standee_key, "imposition_cost_per_hour")
        self.imposition_cost = self.imposition_rate * self.print_forms_per_standee

        if scenario not in (4, 5):
            print_zund_hours = (
                db.get_standee_data(standee_key, "zund_print_form_minutes")
                * self.print_forms_per_standee
                * self.num_standees
            ) / 60
            blank_zund_hours = (
                db.get_standee_data(standee_key, "zund_blank_form_minutes")
                * self.blank_forms_per_standee
                * self.num_standees
            ) / 60
            self.zund_hours = print_zund_hours + blank_zund_hours
            self.zund_cut_cost = self.zund_hours * db.get_standee_data(standee_key, "zund_cost_per_hour")

        if scenario in (4, 5):
            die_unit_cost = db.get_unit_cost("die_cost")
            die_complexity_map = {
                complexity: db.get_standee_data(term, "cutting_die_inches_multiplier")
                for complexity, term in self.STANDEE_MAP.items()
            }
            self.die_cost = 0
            for form in self.print_forms:
                self.die_cost += form.get_die_cost(die_complexity_map, die_unit_cost)

        self.pallet_count = self.print_forms_per_standee
        self.pallet_cost = (
            db.get_unit_cost(PALLET_LABOR) * self.pallet_count + db.get_unit_cost(PALLET) * self.pallet_count
        )
        self.hardware_cost = db.get_standee_data(standee_key, "hardware_cost") * self.num_standees
        if scenario != 1:
            self.shipping_box_cost = db.get_unit_cost(SHIPPING_BOX) * self.num_standees

        desc_label_cost = db.get_unit_cost(DESCRIPTION_LABEL)
        handling_label_cost = db.get_unit_cost(SHIPPING_LABEL)
        self.label_cost = (2 * desc_label_cost + handling_label_cost) * self.num_standees
        if scenario in (1, 2):
            self.instruction_sheet_cost = (
                db.get_standee_data(standee_key, "instruction_sheet_total_cost") * self.num_standees
            )
        if not self.inhouse:
            self.freight_assembly_cost = db.get_unit_cost(EXTERNAL_ASSEMBLY) * self.num_standees
            self.freight_mount_assembly_cost = db.get_unit_cost(EXTERNAL_MOUNT_ASSEMBLY) * self.num_standees
        self.blank_comp_cost = db.get_unit_cost(BLANK_COMP) * self.blank_comp_count
        self.color_comp_cost = db.get_unit_cost(COLOR_COMP) * self.color_comp_count
        self.engineering_design_cost = db.get_standee_data(standee_key, "engineering_design_cost_per_project")

    def get_static_cost(self, scenario: int) -> float:
        """Calculate and return the total static cost for the project, summing all individual cost components."""
        self.calculate_static_costs(scenario)
        return (
            (self.print_form_cost or 0)
            + (self.corrugate_cost or 0)
            + (self.imposition_cost or 0)
            + (self.zund_cut_cost or 0)
            + (self.die_cost or 0)
            + (self.pallet_cost or 0)
            + (self.hardware_cost or 0)
            + (self.shipping_box_cost or 0)
            + (self.label_cost or 0)
            + (self.instruction_sheet_cost or 0)
            + (self.freight_assembly_cost or 0)
            + (self.freight_mount_assembly_cost or 0)
            + (self.blank_comp_cost or 0)
            + (self.color_comp_cost or 0)
            + (self.engineering_design_cost or 0)
        )
