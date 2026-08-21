import unittest

from lib.classes import (
    Complexity,
    Element,
    MidnightOilDB,
    Scenario1,
    Scenario1Input,
    # Scenario2 disabled — no longer offered as a quote scenario.
    # Scenario2,
    # Scenario2Input,
    Scenario3,
    Scenario3Input,
    Scenario4,
    Scenario4Input,
    Scenario5,
    Scenario5Input,
)
from lib.budget_calc import optimize_budget

from lib.print_form_calculator import print_form_calculator

complexity_map = {
    Complexity.SIMPLE: "Simple",
    Complexity.MODERATE: "Moderate",
    Complexity.COMPLEX: "Complex",
}

class TestBudgetCalculator(unittest.TestCase):
    """Tests for max number of standees calculator given certain budgets."""

    @classmethod
    def setUpClass(cls):
        cls.db = MidnightOilDB().connect()

    @classmethod
    def tearDownClass(cls):
        cls.db.close()

    def test_budget_calculator_primate_standee(self):
        """Test budget calculation for Primate standee project."""
        elements = [
            Element(name="monkey", length=80.1012, width=74.9667, complexity=Complexity.SIMPLE),
        ]
        _, bin_dict = print_form_calculator(elements)

        quantities, prices = optimize_budget(
            TestBudgetCalculator.db,
            name = "Primate standee test",
            print_forms = list(bin_dict.values()),
            standee_type = Complexity.COMPLEX
        )
        # calculate_cost returns None and populates the project in place;
        # the rolled-up figure is the total_cost property.
        print('Quantities:', quantities)
        print('Prices:', prices)

    # def test_static_cost_calculator_sonic_standee(self):
    #     """Test static cost calculation for Sonic standee project."""
    #     elements = [
    #         Element(name="Dr. Robotnik", width=41, length=15, complexity=Complexity.COMPLEX),
    #         Element(name="Tails", width=27, length=22, complexity=Complexity.COMPLEX),
    #         Element(name="Sonic 3 TT", width=120, length=30, complexity=Complexity.MODERATE),
    #         Element(name="Knuckles", width=34, length=47, complexity=Complexity.COMPLEX),
    #         Element(name="Shadow", width=96, length=60, complexity=Complexity.COMPLEX),
    #         Element(name="Sonic", width=40, length=50, complexity=Complexity.COMPLEX),
    #         Element(name="Backer", width=122, length=72, complexity=Complexity.SIMPLE),
    #         Element(name="Base", width=120, length=18, complexity=Complexity.SIMPLE),
    #         Element(name="Base Lug", width=31, length=9, complexity=Complexity.SIMPLE),
    #     ]
    #     _, bin_dict = print_form_calculator(elements)
    #     project = Scenario4(
    #         TestStaticCostCalculator.db,
    #         name="Sonic standee (test)",
    #         print_forms=list(bin_dict.values()),
    #         # iQuote project qty; spreadsheet "STANDEE PRINT-NLANK FORMS DATA" says quantity of standeess is only 2
    #         num_standees=1,
    #         standee_type=Complexity.MODERATE,
    #     )
    #     # calculate_cost returns None and populates the project in place;
    #     # the rolled-up figure is the total_cost property.
    #     project.calculate_cost(Scenario4Input())
    #     total_cost = project.total_cost
    #     print(f"\nSonic standee static cost breakdown ({project.num_standees} standees):")
    #     print(f"  Imposition cost:          ${project.imposition_cost or 0:.2f}")
    #     print(f"  Corrugate cost:           ${project.corrugate_cost or 0:.2f}")
    #     print(f"  Hardware cost:            ${project.hardware_cost or 0:.2f}")
    #     print(f"  Engineering design cost:  ${project.engineering_design_cost or 0:.2f}")
    #     print(f"  Color comp cost:          ${project.color_comp_cost or 0:.2f}")
    #     print(f"  Blank comp cost:          ${project.blank_comp_cost or 0:.2f}")
    #     print(f"  Print form cost:          ${project.print_form_cost or 0:.2f}")
    #     print(f"  Print cost:               ${project.print_cost or 0:.2f} (hours: {project.print_hours:.2f})")
    #     print(f"  Die cost:                 ${project.die_cost or 0:.2f}")
    #     print(f"  Pallet cost:              ${project.pallet_cost or 0:.2f}")
    #     print(f"  Shipping box cost:        ${project.shipping_box_cost or 0:.2f}")
    #     print(f"  Label cost:               ${project.label_cost or 0:.2f}")
    #     print(f"  Instruction sheet cost:   ${project.instruction_sheet_cost or 0:.2f}")
    #     print(f"  Freight cost:             ${project.freight_cost or 0:.2f}")
    #     print(f"  {'-' * 38}")
    #     print(f"  Total static cost:        ${total_cost:.2f}\n")
    #     self.assertAlmostEqual(total_cost, 307270.99, delta=1.0)

    # def test_static_cost_calculator_sinner_standee(self):
    #     """Test static cost calculation for Sinner standee project."""
    #     elements = [
    #         Element(name="BACKER", length=84, width=63, complexity=Complexity.SIMPLE),
    #         Element(name="MBJ W/ HAT", length=78, width=27, complexity=Complexity.COMPLEX),
    #         Element(name="MBJ W/GUN", length=72.97, width=24, complexity=Complexity.COMPLEX),
    #         Element(name="BASE", length=18.96, width=68.04, complexity=Complexity.SIMPLE),
    #     ]
    #     _, bin_dict = print_form_calculator(elements)
    #     project = Scenario1(
    #         TestStaticCostCalculator.db,
    #         name="Sinner standee (test)",
    #         print_forms=list(bin_dict.values()),
    #         # iQuote project qty; spreadsheet "STANDEE PRINT-NLANK FORMS DATA" says quantity of standeess is only 10
    #         num_standees=1,
    #         standee_type=Complexity.MODERATE,
    #     )
    #     # calculate_cost returns None and populates the project in place;
    #     # the rolled-up figure is the total_cost property.
    #     project.calculate_cost(Scenario1Input())
    #     total_cost = project.total_cost
    #     print(f"\nSinner standee static cost breakdown ({project.num_standees} standees):")
    #     print(f"  Imposition cost:          ${project.imposition_cost or 0:.2f}")
    #     print(f"  Corrugate cost:           ${project.corrugate_cost or 0:.2f}")
    #     print(f"  Hardware cost:            ${project.hardware_cost or 0:.2f}")
    #     print(f"  Engineering design cost:  ${project.engineering_design_cost or 0:.2f}")
    #     print(f"  Color comp cost:          ${project.color_comp_cost or 0:.2f}")
    #     print(f"  Blank comp cost:          ${project.blank_comp_cost or 0:.2f}")
    #     print(f"  Print form cost:          ${project.print_form_cost or 0:.2f}")
    #     print(f"  Print cost:               ${project.print_cost or 0:.2f} (hours: {project.print_hours:.2f})")
    #     print(f"  Roll-X cost:              ${project.rollx_cost or 0:.2f} (hours: {project.rollx_hours:.2f})")
    #     print(f"  Zund cut cost:            ${project.zund_cut_cost or 0:.2f} (hours: {project.zund_hours:.2f})")
    #     print(f"  Shipping box cost:        ${project.shipping_box_cost or 0:.2f}")
    #     print(f"  Label cost:               ${project.label_cost or 0:.2f}")
    #     print(f"  Instruction sheet cost:   ${project.instruction_sheet_cost or 0:.2f}")
    #     print(f"  {'-' * 38}")
    #     print(f"  Total static cost:        ${total_cost:.2f}\n")
    #     self.assertAlmostEqual(total_cost, 8884.20, delta=1.0)

if __name__ == '__main__':
    elements = [
            Element(name="monkey", length=80.1012, width=74.9667, complexity=Complexity.SIMPLE),
        ]
    _, bin_dict = print_form_calculator(elements)
    db = MidnightOilDB().connect()
    _, bin_dict = print_form_calculator(elements)

    quantities, prices = optimize_budget(
                db,
                name = "Primate standee test",
                budget=20000,
                print_forms = list(bin_dict.values()),
                standee_type = Complexity.COMPLEX
            )
    print('Quantities:', quantities)
    print('Prices:', prices)
    db.close()
    print('hi')