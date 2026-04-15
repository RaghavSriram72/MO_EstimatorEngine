from enum import Enum


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

    def __init__(self, name: str, print_forms: list[Form], num_standees: int):
        self.name = name
        self.print_forms = print_forms
        self.num_standees = num_standees
        self.print_forms_per_standee = len(print_forms)
        self.blank_forms_per_standee = None
        self.blank_form_total = self.blank_forms_per_standee * num_standees if self.blank_forms_per_standee else None
        self.print_form_cost = None
        self.blank_form_cost = None
        self.corrugate_cost = None
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
        self.blank_comp_count = None
        self.colour_comp_count = None
        self.blank_comp_cost = None
        self.colour_comp_cost = None
        self.engineering_design_cost = None
