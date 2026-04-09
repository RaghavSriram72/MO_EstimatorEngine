import math

from rectpack import PackingMode, newPacker

from lib.classes import Complexity, Element, Form

# Calculate size per form -> apply_materials_tool -> fills in material field for each Element

FORM_WIDTH = 60.0
FORM_LENGTH = 80.0
PADDING = 0.25
FORM_AREA = FORM_WIDTH * FORM_LENGTH


def print_form_calculator(initial_elements: list[Element], num_standees: int):
    """
    Tool to calculate number of forms to fit elements.

    Args:
        initial_elements: list of Elements
        num_standees: number of standees to calculate for

    Returns:
        None
    """
    elements = {el.name: _add_padding(el) for el in _get_all_elements(initial_elements)}
    element_list = list(elements.values())
    packer = newPacker(mode=PackingMode.Offline, rotation=True)
    packer.add_bin(FORM_WIDTH, FORM_LENGTH, len(element_list))
    for element in element_list:
        packer.add_rect(element.length, element.width, element.name)
    packer.pack()  # type: ignore
    all_rects = packer.rect_list()
    bin_dict = {}
    for b, _, _, _, _, rid in all_rects:
        if b not in bin_dict:
            bin_dict[b] = Form(id=b, elements=[])
        bin_dict[b].elements.append(rid)
        if elements[rid].complexity.value > bin_dict[b].complexity.value:
            bin_dict[b].complexity = elements[rid].complexity
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
        Element(name=f"{element.name}_{i}", length=split_length, width=split_width) for i in range(num_splits)
    ]


def _add_padding(element):
    """
    Helper function to add padding to an element.

    Args:
        element: Element to add padding to

    Returns:
        Element with padding added
    """
    if min(element.length, element.width) + PADDING > FORM_WIDTH:
        if max(element.length, element.width) + PADDING < FORM_LENGTH:
            if element.length > element.width:
                element.length += PADDING
            else:
                element.width += PADDING
    else:
        element.length += PADDING
        element.width += PADDING
    return element


if __name__ == "__main__":
    elements = [
        Element(name="back", length=120, width=72, complexity=Complexity.SIMPLE),
        Element(name="elph", length=35, width=72, complexity=Complexity.COMPLEX),
        Element(name="glinda", length=35, width=72, complexity=Complexity.COMPLEX),
        Element(name="w", length=16, width=24, complexity=Complexity.MODERATE),
        Element(name="i", length=6, width=18, complexity=Complexity.MODERATE),
        Element(name="c", length=12, width=18, complexity=Complexity.MODERATE),
        Element(name="k", length=14, width=18, complexity=Complexity.MODERATE),
        Element(name="e", length=14, width=18, complexity=Complexity.MODERATE),
        Element(name="d", length=14, width=18, complexity=Complexity.MODERATE),
    ]
    num_standees = 10
    elements, forms = print_form_calculator(elements, num_standees)
    print(f"Forms per standee: {len(forms)}")
    print(f"Total forms: {len(forms) * num_standees}")
    for bin in forms:
        print(f"Form {bin}: {forms[bin].elements}, complexity: {forms[bin].complexity}")
