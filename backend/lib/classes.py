from enum import Enum

try:
    from lib.db import MOADB
except ModuleNotFoundError:
    from db import MOADB


UNIT_MAP = {
    "linear_inches": 1.0,
    "linear_feet": 12.0,
    "each": 1.0,
    "hour": 1.0,
}

class Complexity(Enum):
    """Enum to represent complexity of an element for form calculation."""

    SIMPLE = 1
    MODERATE = 2
    COMPLEX = 3


class PrintMaterial(Enum):
    """Enum to represent print form material for form calculation."""

    LB_95_SHEET = 1
    LB_95_ROLL = 2
    HI_TACK = 3
    BUSMARK = 4


class Element:
    """Class to represent an element for form calculation."""

    def __init__(
        self,
        name: str,
        length: float,
        width: float,
        linear_inches: float | None = None,
        complexity: Complexity = Complexity.SIMPLE,
    ):
        self.name = name
        self.length = length
        self.width = width
        self.complexity = complexity
        self.linear_inches = linear_inches
        self.linear_inches_provided = linear_inches is not None

    def get_linear_inches(self, modifier: float = 1.0) -> float:
        """Calculate linear inches for the element, using either the provided linear inches or the perimeter.

        Args:
            modifier: Multiplier to apply to the linear inches, used for die cost calculation.

        Returns:
            Linear inches for the element, modified by the provided modifier.
        """
        if self.linear_inches:
            return self.linear_inches * modifier
        return 2 * (self.length + self.width) * modifier


class Form:
    """Class to represent a form for form calculation."""

    def __init__(
        self,
        id: str,
        elements: list[Element],
        complexity: Complexity = Complexity.SIMPLE,
    ):
        self.id = id
        self.elements = elements
        self.complexity = complexity
        self.die_cost = 0

    def get_die_cost(self, die_map: dict[Complexity, float], die_unit_cost: float) -> float:
        """Calculate die cost for the form based on the complexity of its elements and a provided die map."""
        cost = 0
        for element in self.elements:
            multiplier = die_map[element.complexity]
            cost += (
                element.get_linear_inches(multiplier if not element.linear_inches_provided else 1)
                * die_unit_cost
            )
        return cost


class Project:
    """Class to represent a overall standee project."""

    def __init__(
        self,
        name: str,
        print_forms: list[Form],
        num_standees: int,
        standee_type: Complexity,
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

        self.print_forms_per_standee = len(print_forms)
        self.print_form_total = self.print_forms_per_standee * self.num_standees
        self.blank_comp_count = blank_comp_count
        self.color_comp_count = color_comp_count

        # DB-dependent fields: set during calculate_static_costs()
        self.blank_form_ratio = None
        self.blank_forms_per_standee = None
        self.blank_form_total = None
        self.total_forms = None
        self.print_form_cost = None  # TODO: define print form material costing
        self.corrugate_cost = None
        self.imposition_rate = None
        self.imposition_cost = None
        self.zund_hours = None
        self.zund_cut_cost = None
        self.die_cost = None
        self.pallet_count = self.print_forms_per_standee
        self.pallet_cost = None
        self.hardware_cost = None
        self.shipper_box_cost = None
        self.label_cost = None
        self.instruction_sheet_cost = None
        self.freight_assembly_cost = None
        self.freight_mount_assembly_cost = None
        self.blank_comp_cost = None
        self.color_comp_cost = None
        self.engineering_design_cost = None

    def calculate_static_costs(self) -> None:
        """Calculate static costs for a project based on the print forms, number of standees, and standee type."""
        db = MOADB()
        standee_key = self.STANDEE_MAP[self.standee_type]

        self.blank_form_ratio = db.get_print_blank_ratio(self.print_forms_per_standee)
        self.blank_forms_per_standee = self.blank_form_ratio * self.print_forms_per_standee
        self.blank_form_total = self.blank_forms_per_standee * self.num_standees
        self.total_forms = self.blank_form_total + self.print_form_total

        self.corrugate_cost = db.get_corrugate_cost() * self.total_forms

        self.imposition_rate = db.get_standee_data(standee_key, "imposition_cost_per_hour")
        self.imposition_cost = self.imposition_rate * self.print_forms_per_standee

        self.zund_hours = (
            db.get_standee_data(standee_key, "zund_print_form_minutes")
            * self.print_forms_per_standee
            * self.num_standees
        ) / 60
        self.zund_cut_cost = self.zund_hours * db.get_standee_data(standee_key, "zund_cost_per_hour")

        die_unit_cost = db.get_die_cost()
        die_complexity_map = {
            complexity: db.get_standee_data(term, "cutting_die_inches_multiplier")
            for complexity, term in self.STANDEE_MAP.items()
        }
        self.die_cost = 0
        for form in self.print_forms:
            self.die_cost += form.get_die_cost(die_complexity_map, die_unit_cost)

        self.pallet_count = self.print_forms_per_standee
        self.pallet_cost = (
            db.get_pallet_labor_cost() * self.print_forms_per_standee
            + db.get_pallet_cost() * self.print_forms_per_standee
        )
        self.hardware_cost = db.get_standee_data(standee_key, "hardware_cost") * self.num_standees
        self.shipper_box_cost = db.get_shipper_box_cost() * self.num_standees
        desc_label_cost = db.get_label_cost("label_description")
        handling_label_cost = db.get_label_cost("label_shipping")
        self.label_cost = (2 * desc_label_cost + handling_label_cost) * self.num_standees
        self.instruction_sheet_cost = (
            db.get_standee_data(standee_key, "instruction_sheet_total_cost") * self.num_standees
        )
        if not self.inhouse:
            self.freight_assembly_cost = db.get_freight_cost(1) * self.num_standees
            self.freight_mount_assembly_cost = db.get_freight_cost(2) * self.num_standees
        self.blank_comp_cost = db.get_comp_cost("blank_comp") * self.blank_comp_count
        self.color_comp_cost = db.get_comp_cost("color_comp") * self.color_comp_count
        self.engineering_design_cost = db.get_standee_data(standee_key, "engineering_design_cost_per_project")

    def get_static_cost(self) -> float:
        """Calculate and return the total static cost for the project, summing all individual cost components."""
        self.calculate_static_costs()
        return (
            (self.print_form_cost or 0)
            + (self.corrugate_cost or 0)
            + (self.imposition_cost or 0)
            + (self.zund_cut_cost or 0)
            + (self.die_cost or 0)
            + (self.pallet_cost or 0)
            + (self.hardware_cost or 0)
            + (self.shipper_box_cost or 0)
            + (self.label_cost or 0)
            + (self.instruction_sheet_cost or 0)
            + (self.freight_assembly_cost or 0)
            + (self.freight_mount_assembly_cost or 0)
            + (self.blank_comp_cost or 0)
            + (self.color_comp_cost or 0)
            + (self.engineering_design_cost or 0)
        )

    # def static_cost_calculator(
    # print_forms: list[Form],
    # num_standees: int,
    # standee_type: Complexity,
    # print_form_material: str,
    # blank_comp_count: int = 0,
    # color_comp_count: int = 0,
    # ) -> float:
    #     db = MOADB()
    #     # per form cost
    #     # blank form calculation
    #     print_forms_per_standee = len(print_forms)
    #     # currently maxes at 10. need to account for if theres more than 10 forms per standee
    #     blank_form_ratio = db.get_print_blank_ratio(print_forms_per_standee)
    #     blank_forms_per_standee = math.ceil(blank_form_ratio * print_forms_per_standee)
    #     total_num_print_forms = print_forms_per_standee * num_standees
    #     total_blank_forms = blank_forms_per_standee * num_standees
    #     total_forms = total_blank_forms + total_num_print_forms
    #     # corrugate cost calculation
    #     corrugate_cost = db.get_corrugate_cost() * total_forms
    #     # print form material cost calculation (TODO)
    #     # imposition cost
    #     imposition_rate = db.get_standee_data(STANDEE_MAP[standee_type], "imposition_cost_per_hour")
    #     impositon_cost = imposition_rate * print_forms_per_standee
    #     # zund cutting cost
    #     zund_hours = (
    #         db.get_standee_data(STANDEE_MAP[standee_type], "zund_print_form_minutes")
    #         * print_forms_per_standee
    #         * num_standees
    #     ) / 60
    #     zund_cut_cost = zund_hours * db.get_standee_data(STANDEE_MAP[standee_type], "zund_cost_per_hour")
    #     # die creation cost
    #     die_complexity_map = {
    #         complexity: (
    #             db.get_standee_data(term, "cutting_die_inches_multiplier"),
    #             db.get_standee_data(term, "cutting_die_cost_per_linear_inch"),
    #         )
    #         for complexity, term in STANDEE_MAP.items()
    #     }
    #     die_cost = 0
    #     for form in print_forms:
    #         die_cost += form.get_die_cost(die_complexity_map)
    #     # pallet cost
    #     pallet_cost = (
    #         db.get_pallet_labor_cost() * print_forms_per_standee + db.get_pallet_cost() * print_forms_per_standee
    #     )

    #     # per standee cost
    #     hardware_cost = db.get_standee_data(STANDEE_MAP[standee_type], "hardware_cost") * num_standees
    #     shipper_box_cost = db.get_shipper_box_cost() * num_standees
    #     desc_label_cost = db.get_label_cost("Description")
    #     handling_label_cost = db.get_label_cost("Handling")
    #     label_cost = (2 * desc_label_cost + handling_label_cost) * num_standees
    #     # instruction sheet cost
    #     instruction_sheet_cost = (
    #         db.get_standee_data(STANDEE_MAP[standee_type], "instruction_sheet_total_cost") * num_standees
    #     )
    #     # freight cost
    #     freight_assembly = db.get_freight_cost(1) * num_standees
    #     freight_mount_assembly = db.get_freight_cost(2) * num_standees
    #     # per project cost
    #     # comp cost
    #     blank_comp_cost = db.get_comp_cost("Blank") * blank_comp_count
    #     color_comp_cost = db.get_comp_cost("color") * color_comp_count
    #     # engineering design cost
    #     engineering_design_cost = db.get_standee_data(
    #         STANDEE_MAP[standee_type], "engineering_design_cost_per_project"
    #     )
