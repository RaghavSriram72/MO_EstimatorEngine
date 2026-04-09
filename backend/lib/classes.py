from enum import Enum


class Complexity(Enum):
    """Enum to represent complexity of an element for form calculation."""

    SIMPLE = 1
    MODERATE = 2
    COMPLEX = 3


class Element:
    """Class to represent an element for form calculation."""

    def __init__(self, name: str, length: float, width: float, complexity: Complexity = Complexity.SIMPLE):
        self.name = name
        self.length = length
        self.width = width
        self.complexity = complexity


class Form:
    """Class to represent a form for form calculation."""

    def __init__(self, id: str, elements: list[str], complexity: Complexity = Complexity.SIMPLE):
        self.id = id
        self.elements = elements
        self.complexity = complexity


class Project:
    """Class to represent a overall standee project."""
    def __init__(self, name: str, print_forms: list[Form], num_standees: int):
        self.name = name
        self.print_forms = print_forms
        self.num_standees = num_standees
