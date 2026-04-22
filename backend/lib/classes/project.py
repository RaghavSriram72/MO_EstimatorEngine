from lib.classes import MOADB, Complexity, Form
from lib.globals import FORM_LENGTH, UNIT_MAP

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

STANDEE_MAP = {
    Complexity.SIMPLE: "Simple Standee",
    Complexity.MODERATE: "Moderate Standee",
    Complexity.COMPLEX: "Complex Standee",
}


class Project:
    """Class to represent a overall standee project."""

    def __init__(
        self,
        name: str,
        print_forms: list[Form],
        num_standees: int,
        standee_type: Complexity,
    ):
        self.standee_type = standee_type
        self.name = name
        self.print_forms = print_forms
        self.num_standees = num_standees

        self.print_forms_per_standee = len(print_forms)
        self.print_form_total = self.print_forms_per_standee * self.num_standees
        self.blank_comp_count = None
        self.color_comp_count = None

        # DB-dependent fields: set during calculate_static_costs()
        self.structural_forms_per_standee = None
        self.blank_forms_per_standee = None
        self.total_forms = None
        self.print_form_cost = None
        self.corrugate_cost = None
        self.imposition_hours = None
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
        self.external_assembly = None
        self.external_mount_assembly = None
        self.full_out_source = None
        self.blank_comp_cost = None
        self.color_comp_cost = None
        self.engineering_design_cost = None

    def calculate_static_costs(
        self,
        scenario: int,
        *,
        num_standees: int = 0,
        print_forms_per_standee: int = 0,
        structural_forms_per_standee: int = 0,
        blank_comp_count: int = 0,
        color_comp_count: int = 0,
        imposition_hours: int = 0,
        zund_hours: int = 0,
        die_cost: float = 0,
        pallet_count: int = 0,
        external_assembly: float = 0,
        external_mount_assembly: float = 0,
        full_out_source: float = 0,
    ) -> None:
        """Calculate static costs for a project based on the print forms, number of standees, and standee type."""
        db = MOADB()
        self.num_standees = num_standees or self.num_standees
        self.blank_comp_count = blank_comp_count or self.blank_comp_count
        self.color_comp_count = color_comp_count or self.color_comp_count
        self.print_forms_per_standee = print_forms_per_standee or self.print_forms_per_standee
        self.structural_forms_per_standee = structural_forms_per_standee or db.get_structure_forms_per_standee(
            self.print_forms_per_standee
        )
        self.blank_forms_per_standee = self.structural_forms_per_standee + self.print_forms_per_standee
        blank_form_total = self.blank_forms_per_standee * self.num_standees

        standee_key = self.STANDEE_MAP[self.standee_type]
        # print form material cost calculation (includes hi-tack for 95# in scenario 4)
        print_form_material = None
        match scenario:
            case 1 | 2 | 3:
                print_form_material = db.get_unit_cost_entry(ROLL_BUSMARK)
            case 4:
                print_form_material = db.get_unit_cost_entry(ROLL_95)

        # ! going to raise for scenario 5 until we have more info on what materials it will use
        if print_form_material is None:
            raise ValueError(f"No print form material found for scenario {scenario}")

        print_form_unit = print_form_material["unit"]
        if print_form_unit == "each":
            self.print_form_cost = print_form_material["cost"] * self.print_form_total
        elif print_form_unit == "linear_foot":
            print_form_material["cost"] *= UNIT_MAP[print_form_unit]
            self.print_form_cost = print_form_material["cost"] * FORM_LENGTH * self.print_form_total
        if scenario == 4:
            hi_tack_material = db.get_unit_cost_entry(ROLL_HI_TACK)
            hi_tack_unit = hi_tack_material["unit"]
            hi_tack_cost = hi_tack_material["cost"] * UNIT_MAP[hi_tack_unit] * FORM_LENGTH * self.print_form_total
            self.print_form_cost += hi_tack_cost

        # corrugate cost calculation
        print(self.blank_forms_per_standee)
        self.corrugate_cost = db.get_unit_cost(CORRUGATE) * blank_form_total

        # imposition cost calculation
        self.imposition_hours = imposition_hours or self.print_forms_per_standee
        imposition_rate = db.get_standee_data(standee_key, "imposition_cost_per_hour")
        self.imposition_cost = imposition_rate * self.imposition_hours

        # zund cut cost calculation
        if scenario not in (4, 5):
            self.zund_hours = zund_hours
            if not self.zund_hours:
                total_linear_inches = sum(form.get_linear_inches() for form in self.print_forms) * self.num_standees
                print(total_linear_inches * self.num_standees, ((total_linear_inches/8000) * 72) * self.num_standees)
                print(f"Calculating zund hours for scenario {scenario} with standee type {self.standee_type}")
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

                print(f"Print zund hours: {print_zund_hours}, Blank zund hours: {blank_zund_hours}")
                self.zund_hours = print_zund_hours + blank_zund_hours
            self.zund_cut_cost = self.zund_hours * db.get_standee_data(standee_key, "zund_cost_per_hour")

        # die cost calculation
        if scenario in (4, 5):
            self.die_cost = die_cost
            if not self.die_cost:
                die_unit_cost = db.get_unit_cost("die_cost")
                die_complexity_map = {
                    complexity: db.get_standee_data(term, "cutting_die_inches_multiplier")
                    for complexity, term in self.STANDEE_MAP.items()
                }
                for form in self.print_forms:
                    self.die_cost += form.get_die_cost(die_complexity_map, die_unit_cost)

        # pallet and pallet labor cost calculation
        # ! def scenario based
        self.pallet_count = pallet_count or self.print_forms_per_standee
        self.pallet_cost = (
            db.get_unit_cost(PALLET_LABOR) * self.pallet_count + db.get_unit_cost(PALLET) * self.pallet_count
        )

        # hardware cost calculation
        self.hardware_cost = db.get_standee_data(standee_key, "hardware_cost") * self.num_standees

        # shipping and label cost calculation
        # ! scenario based?
        # if scenario != 2:
        self.shipping_box_cost = db.get_unit_cost(SHIPPING_BOX) * self.num_standees
        desc_label_cost = db.get_unit_cost(DESCRIPTION_LABEL)
        handling_label_cost = db.get_unit_cost(SHIPPING_LABEL)
        self.label_cost = (2 * desc_label_cost + handling_label_cost) * self.num_standees

        # freight cost calculation
        if scenario in (1, 2):
            self.instruction_sheet_cost = (
                db.get_standee_data(standee_key, "instruction_sheet_total_cost") * self.num_standees
            )
        match scenario:
            case 3:
                self.external_assembly = external_assembly or db.get_unit_cost(EXTERNAL_ASSEMBLY)
            case 4:
                self.external_mount_assembly = external_mount_assembly or db.get_unit_cost(EXTERNAL_MOUNT_ASSEMBLY)
            case 5:
                self.full_out_source = full_out_source or db.get_unit_cost(FULL_OUT_SOURCE)

        # composition
        if self.blank_comp_count:
            self.blank_comp_cost = db.get_unit_cost(BLANK_COMP) * self.blank_comp_count
        if self.color_comp_count:
            self.color_comp_cost = db.get_unit_cost(COLOR_COMP) * self.color_comp_count
        self.engineering_design_cost = db.get_standee_data(standee_key, "engineering_design_cost_per_project")
        db.close()

    def get_static_cost(self, scenario: int, **kwargs) -> float:
        """Calculate and return the total static cost for the project, summing all individual cost components."""
        self.calculate_static_costs(scenario, **kwargs)
        universal_costs = (
            (self.corrugate_cost or 0)
            + (self.imposition_cost or 0)
            + (self.blank_comp_cost or 0)
            + (self.color_comp_cost or 0)
            + (self.engineering_design_cost or 0)
            + (self.hardware_cost or 0)
        )
        scenario_cost = 0
        match scenario:
            case 1:
                scenario_cost = (
                    (self.print_form_cost or 0)
                    + (self.zund_cut_cost or 0)
                    + (self.pallet_cost or 0)  # ! not sure if needed
                    + (self.instruction_sheet_cost or 0)
                )
            case 2:
                scenario_cost = (
                    (self.print_form_cost or 0)
                    + (self.zund_cut_cost or 0)
                    + (self.pallet_cost or 0)  # ! not sure if needed
                    + (self.shipping_box_cost or 0)
                    + (self.label_cost or 0)
                    + (self.instruction_sheet_cost or 0)
                )
            case 3:
                scenario_cost = (
                    (self.print_form_cost or 0)
                    + (self.zund_cut_cost or 0)
                    + (self.pallet_cost or 0)
                    + (self.shipping_box_cost or 0)
                    + (self.label_cost or 0)
                    + (self.instruction_sheet_cost or 0)
                    + (self.external_assembly or 0)
                )
            case 4:
                scenario_cost = (
                    (self.print_form_cost or 0)
                    + (self.die_cost or 0)
                    + (self.pallet_cost or 0)
                    + (self.shipping_box_cost or 0)
                    + (self.label_cost or 0)
                    + (self.instruction_sheet_cost or 0)
                    + (self.external_mount_assembly or 0)
                )
            case 5:
                scenario_cost = -1  # Placeholder for scenario 5, which may have a different cost structure
        return scenario_cost + universal_costs

class Scenario1(Project):
    """Scenario 1: In-house production with basic materials and processes."""
    def __init__(self, name: str, print_forms: list[Form], num_standees: int, standee_type: Complexity):
        super().__init__(name, print_forms, num_standees, standee_type)