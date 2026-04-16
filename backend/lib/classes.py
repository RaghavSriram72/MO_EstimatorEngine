import math
from enum import Enum

from lib.classes import Complexity, Element, Form, Project
from lib.db import MOADB


class Complexity(Enum):
    """Enum to represent complexity of an element for form calculation."""

    SIMPLE = 1
    MODERATE = 2
    COMPLEX = 3


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

    def get_die_cost(self, die_map: dict[Complexity, tuple[float, float]]) -> float:
        """Calculate die cost for the form based on the complexity of its elements and a provided die map."""
        cost = 0
        for element in self.elements:
            multiplier, cost_per_inch = die_map[element.complexity]
            cost += (
                element.get_linear_inches(multiplier if not element.linear_inches_provided else 1.0)
                * cost_per_inch
            )
        return cost


class Project:
    """Class to represent a overall standee project."""

    def __init__(self, name: str, print_forms: list[Form], num_standees: int, standee_type: Complexity, blank_comp_count: int, colour_comp_count: int):
        self.db = MOADB()
        self.STANDEE_MAP = {
        Complexity.SIMPLE: "Simple Standee",
        Complexity.MODERATE: "Moderate Standee",
        Complexity.COMPLEX: "Complex Standee",
        }
        self.standee_type = standee_type
        self.name = name
        self.print_forms = print_forms
        self.num_standees = num_standees

        self.print_forms_per_standee = len(print_forms)
        self.print_form_total = self.print_forms_per_standee * self.num_standees
        self.blank_form_ratio = self.db.get_print_blank_ratio(self.print_forms_per_standee)
        self.blank_forms_per_standee = math.ceil(self.blank_form_ratio * self.print_forms_per_standee)
        self.blank_form_total = self.blank_forms_per_standee * self.num_standees
        self.total_forms = self.blank_form_total + self.print_form_total
        self.print_form_cost = 0 #NOT SURE HOW TO DO THIS
        self.blank_form_cost = 0 #NOT SURE HOW TO DO THIS
        self.corrugate_cost = self.db.get_corrugate_cost() * self.total_forms
        self.imposition_rate = self.db.get_standee_data(self.STANDEE_MAP[standee_type], "imposition_cost_per_hour")
        self.imposition_cost = self.imposition_rate * self.print_forms_per_standee
        self.zund_hours = (
            self.db.get_standee_data(self.STANDEE_MAP[self.standee_type], "zund_print_form_minutes")
            * self.print_forms_per_standee
            * self.num_standees
        ) / 60
        self.zund_cut_cost = self.zund_hours * self.db.get_standee_data(self.STANDEE_MAP[self.standee_type], "zund_cost_per_hour")
        
        die_complexity_map = {
            complexity: (
                self.db.get_standee_data(term, "cutting_die_inches_multiplier"),
                self.db.get_standee_data(term, "cutting_die_cost_per_linear_inch"),
            )
            for complexity, term in self.STANDEE_MAP.items()
        }
        self.die_cost = 0
        for form in self.print_forms:
            self.die_cost += form.get_die_cost(die_complexity_map)

        self.pallet_count = self.print_forms_per_standee
        self.pallet_cost = (
            self.db.get_pallet_labor_cost() * self.print_forms_per_standee + self.db.get_pallet_cost() * self.print_forms_per_standee
        )
        self.hardware_cost = self.db.get_standee_data(self.STANDEE_MAP[self.standee_type], "hardware_cost") * self.num_standees
        self.shipper_box_cost = self.db.get_shipper_box_cost() * self.num_standees
        desc_label_cost = self.db.get_label_cost("Description")
        handling_label_cost = self.db.get_label_cost("Handling")
        self.label_cost = (2 * desc_label_cost + handling_label_cost) * self.num_standees
        self.instruction_sheet_cost = self.db.get_standee_data(self.STANDEE_MAP[self.standee_type], "instruction_sheet_total_cost") * self.num_standees
        self.freight_assembly_cost = self.db.get_freight_cost(1) * self.num_standees # this and below are for different scenarios
        self.freight_mount_assembly_cost = self.db.get_freight_cost(2) * self.num_standees
        self.blank_comp_count = blank_comp_count # should be param
        self.colour_comp_count = colour_comp_count # should be param
        self.blank_comp_cost = self.db.get_comp_cost("Blank") * self.blank_comp_count
        self.colour_comp_cost = self.db.get_comp_cost("Colour") * self.colour_comp_count
        self.engineering_design_cost = self.db.get_standee_data(self.STANDEE_MAP[self.standee_type], "engineering_design_cost_per_project")

    
    def get_static_cost(self) -> float:
        return (
            self.print_form_cost
            + self.blank_form_cost
            + self.corrugate_cost
            + self.imposition_cost
            + self.zund_cut_cost
            + self.die_cost
            + self.pallet_cost
            + self.hardware_cost
            + self.shipper_box_cost
            + self.label_cost
            + self.instruction_sheet_cost
            + self.freight_assembly_cost
            + self.freight_mount_assembly_cost
            + self.blank_comp_cost
            + self.colour_comp_cost
            + self.engineering_design_cost
        )
        
   
   
   
   
   
   
   
   
   
   
   
   
   
    # def static_cost_calculator(
    # print_forms: list[Form],
    # num_standees: int,
    # standee_type: Complexity,
    # print_form_material: str,
    # blank_comp_count: int = 0,
    # colour_comp_count: int = 0,
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
    #     colour_comp_cost = db.get_comp_cost("Colour") * colour_comp_count
    #     # engineering design cost
    #     engineering_design_cost = db.get_standee_data(
    #         STANDEE_MAP[standee_type], "engineering_design_cost_per_project"
    #     )