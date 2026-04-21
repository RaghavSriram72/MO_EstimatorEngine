import math
from importlib import import_module
from pathlib import Path

from rectpack import PackingMode, newPacker

from lib.classes import Complexity, Element, Form
from lib.globals import FORM_LENGTH, FORM_WIDTH, PADDING

# Calculate size per form -> apply_materials_tool -> fills in material field for each Element

COMPLEXITY_COLORS = {
    Complexity.SIMPLE: "#7fc97f",
    Complexity.MODERATE: "#fdc086",
    Complexity.COMPLEX: "#beaed4",
}


def print_form_calculator(initial_elements: list[Element], num_standees: int):
    """
    Tool to calculate number of forms to fit elements.

    Args:
        initial_elements: list of Elements
        num_standees: number of standees to calculate for

    Returns:
        None
    """
    elements, bin_dict, _ = _pack_elements(initial_elements)
    return elements, bin_dict


def visualize_form_layout(
    initial_elements: list[Element],
    output_dir: str = "form_visualizations",
    dpi: int = 150,
):
    """Render each packed form as an image with element bounding boxes.

    Args:
        initial_elements: List of elements to pack onto 60x80 forms.
        output_dir: Directory where per-form images are saved.
        dpi: Output image DPI.

    Returns:
        A list of file paths to generated images.
    """
    try:
        patches = import_module("matplotlib.patches")
        plt = import_module("matplotlib.pyplot")
    except ImportError as exc:  # pragma: no cover - depends on runtime environment
        msg = "matplotlib is required to visualize form layouts. Install it with: pip install matplotlib"
        raise ImportError(msg) from exc

    _, _, placements = _pack_elements(initial_elements)
    save_dir = Path(output_dir)
    save_dir.mkdir(parents=True, exist_ok=True)

    image_paths = []
    for form_id in sorted(placements):
        fig, ax = plt.subplots(figsize=(7.5, 10))
        ax.set_xlim(0, FORM_WIDTH)
        ax.set_ylim(0, FORM_LENGTH)
        ax.set_aspect("equal", adjustable="box")

        # Draw form boundary first so all elements remain visible inside it.
        ax.add_patch(
            patches.Rectangle(
                (0, 0),
                FORM_WIDTH,
                FORM_LENGTH,
                linewidth=2,
                edgecolor="black",
                facecolor="none",
            )
        )

        for placement in placements[form_id]:
            element = placement["element"]
            x = placement["x"]
            y = placement["y"]
            width = placement["width"]
            length = placement["length"]

            fill = COMPLEXITY_COLORS.get(element.complexity, "#8da0cb")
            ax.add_patch(
                patches.Rectangle(
                    (x, y),
                    width,
                    length,
                    linewidth=1,
                    edgecolor="black",
                    facecolor=fill,
                    alpha=0.75,
                )
            )
            ax.text(
                x + width / 2,
                y + length / 2,
                f"{element.name}\n{width:.2f} x {length:.2f}",
                ha="center",
                va="center",
                fontsize=7,
            )

        ax.set_title(f"Form {form_id} Layout ({FORM_WIDTH:.0f} x {FORM_LENGTH:.0f} in)")
        ax.set_xlabel("Width (in)")
        ax.set_ylabel("Length (in)")
        ax.grid(True, linestyle="--", linewidth=0.4, alpha=0.4)

        out_path = save_dir / f"form_{form_id}.png"
        fig.savefig(str(out_path), dpi=dpi, bbox_inches="tight")
        plt.close(fig)
        image_paths.append(str(out_path))

    return image_paths


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
    placements = {}
    for b, x, y, w, h, rid in all_rects:
        if b not in bin_dict:
            bin_dict[b] = Form(id=b, elements=[])
            placements[b] = []
        bin_dict[b].elements.append(elements[rid])
        if elements[rid].complexity.value > bin_dict[b].complexity.value:
            bin_dict[b].complexity = elements[rid].complexity
        placements[b].append(
            {
                "element": elements[rid],
                "x": x,
                "y": y,
                "width": w,
                "length": h,
            }
        )
    return elements, bin_dict, placements


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
        # split perpindicular to length
        num_splits = math.ceil(element.length / FORM_LENGTH)
        split_length = element.length / num_splits
        split_width = element.width
        split_linear_inches = (element.get_linear_inches() / num_splits) + element.width
    else:
        # split perpindicular to width
        num_splits = math.ceil(element.width / FORM_WIDTH)
        split_width = element.width / num_splits
        split_length = element.length
        split_linear_inches = (element.get_linear_inches() / num_splits) + element.length
    return [
        Element(
            name=f"{element.name}_{i}",
            length=split_length,
            width=split_width,
            linear_inches=split_linear_inches,
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
    padded_element = Element(
        name=element.name,
        length=element.length,
        width=element.width,
        linear_inches=element.linear_inches,
        complexity=element.complexity,
    )
    if min(padded_element.length, padded_element.width) + PADDING > FORM_WIDTH:
        if max(padded_element.length, padded_element.width) + PADDING < FORM_LENGTH:
            if padded_element.length > padded_element.width:
                padded_element.length += PADDING
            else:
                padded_element.width += PADDING
    else:
        padded_element.length += PADDING
        padded_element.width += PADDING
    return padded_element


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
    num_standees = 10
    elements, forms = print_form_calculator(input_elements, num_standees)
    print(f"Forms per standee: {len(forms)}")
    print(f"Total forms: {len(forms) * num_standees}")
    for bin in forms:
        print(
            f"""Form {bin}: {[element.name for element in forms[bin].elements]}, complexity: {forms[bin].complexity}"""
        )
    image_paths = visualize_form_layout(input_elements)
    print(f"Saved {len(image_paths)} layout image(s):")
    for path in image_paths:
        print(path)
