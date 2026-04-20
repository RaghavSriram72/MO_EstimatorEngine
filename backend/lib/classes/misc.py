from enum import Enum

UNIT_MAP = {
    "linear_inch": 1.0,
    "linear_foot": 12.0,
    "thousand": 1 / 1000,
    "each": 1.0,
    "hour": 1.0,
}


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

    def get_die_cost(self, die_map: dict[Complexity, float], die_unit_cost: float) -> float:
        """Calculate die cost for the form based on the complexity of its elements and a provided die map."""
        cost = 0
        for element in self.elements:
            multiplier = die_map[element.complexity]
            cost += element.get_linear_inches(multiplier if not element.linear_inches_provided else 1) * die_unit_cost
        return cost
