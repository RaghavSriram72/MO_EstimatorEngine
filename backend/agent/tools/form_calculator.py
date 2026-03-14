import math

from langchain.tools import tool

# Calculate size per form -> apply_materials_tool -> fills in material field for each Element

FORM_WIDTH = 60.0
FORM_LENGTH = 80.0
FORM_AREA = FORM_WIDTH * FORM_LENGTH


# Store all Form types in some data structure. should be pulled from DB?
class Material:
    """Class to represent a material for form calculation."""
    def __init__(self, name, unit, unit_price):
        self.name = (name,)
        self.unit = unit
        self.unit_price = unit_price


class Element:
    """Class to represent an element for form calculation."""
    def __init__(self, id: int, length: float, width: float, material=None):
        self.id = (id,)
        self.length = length
        self.width = width
        self.material = material


@tool
def form_calculator(elements: list[Element]):
    """
    Tool to calculate number of forms to fit elements.

    Args:
        elements: list of Elements

    Returns:
        None
    """
    elements = _get_all_elements(elements)
    materials = {el.material: el for el in elements if el.material is not None}

    if not materials:
        # bin-packing on all elements
        pass

    for material, element in materials.items():
        # bin-packing on elements with material
        pass


def _fits_on_form(element: Element):
    """
    Helper function to check if an element can fit on a form.

    Args:
        element: Element to check

    Returns:
        True if element can fit on a form, False otherwise
    """
    return (element.length <= FORM_LENGTH and element.width <= FORM_WIDTH) or (
        element.length <= FORM_WIDTH and element.width <= FORM_LENGTH
    )


def _get_all_elements(elements: list[Element]):
    """
    Helper function to get all elements, including split elements.

    Args:
        elements: list of Elements

    Returns:
        list of all Elements, including split elements
    """
    changed = True
    while changed:
        changed = False
        new_elements = []
        for element in elements:
            if _fits_on_form(element):
                new_elements.append(element)
            else:
                new_elements.extend(_split_element(element))
                changed = True
        elements = new_elements
    return elements


def _split_element(element):
    """
    Helper function to split elements too large to fit on a single form regardless of rotation.

    Args:
        element: Element to split
    Returns:
        list of Elements that can fit within a form
    """
    if element.length > element.width:
        # split along length
        num_splits = math.ceil(element.length / FORM_LENGTH)
        split_length = element.length / num_splits
        split_width = element.width
    else:
        # split along width
        num_splits = math.ceil(element.width / FORM_WIDTH)
        split_width = element.width / num_splits
        split_length = element.length
    return [
        Element(id=element.id, length=split_length, width=split_width, material=element.material)
        for _ in range(num_splits)
    ]
