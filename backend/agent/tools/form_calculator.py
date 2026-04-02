import math

from langchain.tools import tool
from rectpack import PackingMode, newPacker

# Calculate size per form -> apply_materials_tool -> fills in material field for each Element

FORM_WIDTH = 60.0
FORM_LENGTH = 80.0
PADDING = 0.125
FORM_AREA = FORM_WIDTH * FORM_LENGTH


class Element:
    """Class to represent an element for form calculation."""

    def __init__(self, id: str, length: float, width: float):
        self.id = id
        self.length = length
        self.width = width


@tool
def form_calculator(elements: list[Element], num_standees: int):
    """
    Tool to calculate number of forms to fit elements.

    Args:
        elements: list of Elements
        num_standees: number of standees to calculate for

    Returns:
        None
    """
    elements = [_add_padding(el) for el in _get_all_elements(elements)]
    packer = newPacker(mode=PackingMode.Offline, rotation=True)
    packer.add_bin(FORM_WIDTH, FORM_LENGTH, len(elements))
    for element in elements:
        packer.add_rect(element.length, element.width, element.id)
    packer.pack() # type: ignore
    forms = len(packer)
    return forms, packer
    
        


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
        # ! need to adjust name to make unique
        Element(id=f"{element.id}_{i}", length=split_length, width=split_width)
        for i in range(num_splits)
    ]

def _add_padding(element):
    """
    Helper function to add padding to an element.

    Args:
        element: Element to add padding to

    Returns:
        Element with padding added
    """
    return Element(
        id=element.id,
        length=element.length + PADDING,  # Add padding to length
        width=element.width + PADDING,  # Add padding to width
    )

if __name__ == "__main__":
    elements = [
        Element(id="1", length=30, width=40),
        Element(id="2", length=50, width=70),
        Element(id="3", length=90, width=110),
    ]
    num_standees = 10
    forms_needed, packer = form_calculator.invoke({"elements": elements, "num_standees": num_standees})
    all_rects = packer.rect_list()
    for rect in all_rects:
        b, x, y, w, h, rid = rect
        print(f"Element {rid} is placed at ({x}, {y}) with width {w} and height {h} in bin {b}")
    print(f"Forms needed: {forms_needed}")
