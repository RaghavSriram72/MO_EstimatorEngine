import math

from rectpack import PackingMode, newPacker

from lib.classes import Complexity, Element, Form
from lib.globals import FORM_95_LENGTH, FORM_95_WIDTH, PADDING


def print_form_calculator(
    initial_elements: list[Element],
    form_width: float = FORM_95_WIDTH,
    form_length: float = FORM_95_LENGTH,
    padding: float = PADDING,
):
    elements, bin_dict = _pack_elements(initial_elements, form_width, form_length, padding)
    return elements, bin_dict


def _pack_elements(
    initial_elements: list[Element],
    form_width: float,
    form_length: float,
    padding: float,
):
    """Pack elements and return forms plus rectangle coordinates for each packed element."""
    # Use internal unique ids for packing keys so empty/duplicate element names
    # from frontend do not collapse entries. Keep element.name on each Element
    # for display but pass a generated uid to the packer.
    all_elements = _get_all_elements(initial_elements, form_width, form_length)
    elements: dict[str, Element] = {}
    for i, el in enumerate(all_elements):
        padded = _add_padding(el, form_length, padding)
        uid = f"el_{i}"
        # Ensure elements with empty names get a backend placeholder
        if not padded.name:
            padded.name = uid
        elements[uid] = padded

    element_list = list(elements.values())
    packer = newPacker(mode=PackingMode.Offline, rotation=True)
    packer.add_bin(form_width, form_length, len(element_list))
    for uid, element in elements.items():
        packer.add_rect(element.length, element.width, uid)
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


def _fits_on_form(element: Element, form_width: float, form_length: float) -> bool:
    return (element.length <= form_length and element.width <= form_width) or (
        element.length <= form_width and element.width <= form_length
    )


def _get_all_elements(elements: list[Element], form_width: float, form_length: float) -> list[Element]:
    changed = True
    while changed:
        changed = False
        new_elements = []
        for element in elements:
            if _fits_on_form(element, form_width, form_length):
                new_elements.append(element)
            else:
                new_elements.extend(_split_element(element, form_width, form_length))
                changed = True
        elements = new_elements
    return elements


def _split_element(element: Element, form_width: float, form_length: float) -> list[Element]:
    length_ratio = element.length / form_length
    width_ratio = element.width / form_width

    if length_ratio >= width_ratio and element.length > form_length:
        # Split along the longer side when it is the dimension preventing a fit.
        num_splits = math.ceil(element.length / form_length)
        split_length = element.length / num_splits
        split_width = element.width
        split_linear_inches = (element.get_linear_inches() / num_splits) + element.width
    elif element.width > form_width:
        # Split width when it is the dimension preventing a fit.
        num_splits = math.ceil(element.width / form_width)
        split_width = element.width / num_splits
        split_length = element.length
        split_linear_inches = (element.get_linear_inches() / num_splits) + element.length
    else:
        raise ValueError(
            f"Cannot split element {element.name}: {element.length} x {element.width} "
            "does not exceed form limits in a splittable way"
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


def _add_padding(element: Element, form_length: float, padding: float) -> Element:
    element.length = min(element.length + padding, form_length)
    element.width = min(element.width + padding, form_length)
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
