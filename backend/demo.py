from lib.classes import Scenario1
from lib.classes import Complexity, Element, Project
from lib.print_form_calculator import print_form_calculator

complexity_map = {
    Complexity.SIMPLE: "Simple",
    Complexity.MODERATE: "Moderate",
    Complexity.COMPLEX: "Complex",
}


def demo():
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

    for element in elements:
        print(f"{element.name}: {element.length}x{element.width}, complexity: {complexity_map[element.complexity]}")

    print()
    num_standees = 10
    standee_type = Complexity.MODERATE

    _, bin_dict = print_form_calculator(elements, num_standees)
    print(f"Forms per standee: {len(bin_dict)}")

    project = Scenario1(
        name="Demo Project",
        print_forms=list(bin_dict.values()),
        num_standees=num_standees,
        standee_type=standee_type,
    )

    total_cost = project.calculate_cost()
    print(f"\n  Imposition cost:          ${project.imposition_cost or 0:.2f}")
    print(f"  Corrugate cost:           ${project.corrugate_cost or 0:.2f}")
    print(f"  Hardware cost:            ${project.hardware_cost or 0:.2f}")
    print(f"  Engineering design cost:  ${project.engineering_design_cost or 0:.2f}")
    print(f"  Color comp cost:          ${project.color_comp_cost or 0:.2f}")
    print(f"  Blank comp cost:          ${project.blank_comp_cost or 0:.2f}")
    print(f"  Print form cost:          ${project.print_form_cost or 0:.2f}")
    print(f"  Zund cut cost:            ${project.zund_cost or 0:.2f}")
    print(f"  Shipping box cost:        ${project.shipping_box_cost or 0:.2f}")
    print(f"  Label cost:               ${project.label_cost or 0:.2f}")
    print(f"  Instruction sheet cost:   ${project.instruction_sheet_cost or 0:.2f}")
    print(f"  {'─' * 38}")
    print(f"  Total static cost:        ${total_cost:.2f}\n")


if __name__ == "__main__":
    demo()
