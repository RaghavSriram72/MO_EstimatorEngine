import math

from rectpack import PackingMode, newPacker

from lib.classes import Complexity, Element, Form
from lib.globals import FORM_LENGTH, FORM_WIDTH, PADDING


def print_form_calculator(initial_elements: list[Element]):
    """
    Tool to calculate number of forms to fit elements.

    Args:
        initial_elements: list of Elements
        num_standees: number of standees to calculate for

    Returns:
        None
    """
    elements, bin_dict = _pack_elements(initial_elements)
    return elements, bin_dict


def _pack_elements(initial_elements: list[Element]):
    """Pack elements and return forms plus rectangle coordinates for each packed element."""
    elements = {el.name: _add_padding(el) for el in _get_all_elements(initial_elements)}
    element_list = list(elements.values())
    packer = newPacker(mode=PackingMode.Offline, rotation=True)
    packer.add_bin(FORM_WIDTH, FORM_LENGTH, len(element_list))
    for element in element_list:
        packer.add_rect(element.length, element.width, element.name)
    packer.pack()  # type: ignore

    all_rects = packer.rect_list()
    bin_dict = {}
    for b, x, y, w, h, rid in all_rects:
        element = elements[rid]
        element.length = h
        element.width = w
        if b not in bin_dict:
            bin_dict[b] = Form(id=b, elements=[])
        bin_dict[b].elements.append(element)
        if element.complexity.value > bin_dict[b].complexity.value:
            bin_dict[b].complexity = element.complexity
    return elements, bin_dict


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
    length_ratio = element.length / FORM_LENGTH
    width_ratio = element.width / FORM_WIDTH

    if length_ratio >= width_ratio and element.length > FORM_LENGTH:
        # Split along the longer side when it is the dimension preventing a fit.
        num_splits = math.ceil(element.length / FORM_LENGTH)
        split_length = element.length / num_splits
        split_width = element.width
        split_linear_inches = (element.get_linear_inches() / num_splits) + element.width
    elif element.width > FORM_WIDTH:
        # Split width when it is the dimension preventing a fit.
        num_splits = math.ceil(element.width / FORM_WIDTH)
        split_width = element.width / num_splits
        split_length = element.length
        split_linear_inches = (element.get_linear_inches() / num_splits) + element.length
    else:
        raise ValueError(
            (
                f"Cannot split element {element.name}: {element.length} x {element.width} "
                "does not exceed form limits in a splittable way"
            )
        )

    return [
        Element(
            name=f"{element.name}_{i}",
            length=split_length,
            width=split_width,
            linear_inches=split_linear_inches,
            complexity=element.complexity,
        )
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
    element.length = min(element.length + PADDING, FORM_LENGTH)
    element.width = min(element.width + PADDING, FORM_LENGTH)
    return element


if __name__ == "__main__":
    input_elements = [
        Element(name="Dr. Robotnik", width=41, length=15, complexity=Complexity.COMPLEX),
        Element(name="Tails", width=27, length=22, complexity=Complexity.COMPLEX),
        Element(name="Sonic 3 TT", width=120, length=30, complexity=Complexity.MODERATE),
        Element(name="Knuckles", width=34, length=47, complexity=Complexity.COMPLEX),
        Element(name="Shadow", width=96, length=60, complexity=Complexity.COMPLEX),
        Element(name="Sonic", width=40, length=50, complexity=Complexity.COMPLEX),
        Element(name="Backer", width=122, length=72, complexity=Complexity.SIMPLE),
        Element(name="Base", width=120, length=18, complexity=Complexity.SIMPLE),
        Element(name="Base Lug", width=31, length=9, complexity=Complexity.SIMPLE),
    ]
    elements, forms = print_form_calculator(input_elements)
    print(f"Forms per standee: {len(forms)}")
    print(f"Total forms: {len(forms) * 10}")
    for bin in forms:
        print(
            f"""Form {bin}: {[element.name for element in forms[bin].elements]}, complexity: {forms[bin].complexity}"""
        )
