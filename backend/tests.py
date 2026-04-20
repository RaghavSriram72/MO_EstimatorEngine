import os
import unittest

from dotenv import load_dotenv
from lib.db import MOADB

from lib.classes import Complexity, Element, Project
from lib.print_form_calculator import print_form_calculator

complexity_map = {
    Complexity.SIMPLE: "Simple",
    Complexity.MODERATE: "Moderate",
    Complexity.COMPLEX: "Complex",
}

class TestPrintFormCalculator(unittest.TestCase):
    def test_print_form_calculator_primate_standee(self):
        elements = [
            Element(name="monkey", length=80.1012, width=74.9667, complexity=Complexity.COMPLEX),
        ]
        num_standees = 2
        standee_type = Complexity.MODERATE
        _, bin_dict = print_form_calculator(elements, 1)
        print(f"Forms per standee: {len(bin_dict)}")

        self.assertEqual(len(bin_dict), 2)


    def test_print_form_calculator_sonic_standee(self):
        elements = [
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

        num_standees = 2428
        standee_type = Complexity.MODERATE
        __, forms = print_form_calculator(elements, 1)
        print(f"Forms per standee: {len(forms)}")
        # print(f"Total forms: {len(forms) * num_standees}")
        for bin in forms:
            print(
                f"""Form {bin}: {[element.name for element in forms[bin].elements]}, complexity: {forms[bin].complexity}"""
            )
        self.assertEqual(len(forms), 6)

    def test_print_form_calculator_sinner_standee(self):
        elements = [
            Element(name="BACKER", length=84, width=63, complexity=Complexity.SIMPLE),
            Element(name="MBJ W/ HAT", length=78, width=27, complexity=Complexity.COMPLEX),
            Element(name="MBJ W/GUN", length=72.97, width=24, complexity=Complexity.COMPLEX),
            Element(name="BASE", length=18.96, width=68.04, complexity=Complexity.SIMPLE),
        ]
        num_standees = 50
        standee_type = Complexity.MODERATE
        _, bin_dict = print_form_calculator(elements, 1)
        print(f"Forms per standee: {len(bin_dict)}")

        self.assertEqual(len(bin_dict), 3)


class TestStaticCostCalculator(unittest.TestCase):
    def test_static_cost_calculator_primate_standee(self):
        elements = [
            Element(name="monkey", length=80.1012, width=74.9667, complexity=Complexity.COMPLEX),
        ]
        _, bin_dict = print_form_calculator(elements, 18)
        project = Project(
            name="Primate standee (test)",
            print_forms=list(bin_dict.values()),
            num_standees=18, # iQuote project qty; spreadsheet "STANDEE PRINT-NLANK FORMS DATA" says quantity of standeess is only 2 there
            standee_type=Complexity.MODERATE,
            blank_comp_count=2,
            color_comp_count=2,
            full_out_source=False,
            partial_out_source=False,
            inhouse=True,
        )
        total_cost = project.get_static_cost()
        self.assertAlmostEqual(total_cost, 2256.97, delta=1.0)

    def test_static_cost_calculator_sonic_standee(self):
        elements = [
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
        _, bin_dict = print_form_calculator(elements, 2428)
        project = Project(
            name="Sonic standee (test)",
            print_forms=list(bin_dict.values()),
            num_standees=2428, # iQuote project qty; spreadsheet "STANDEE PRINT-NLANK FORMS DATA" says quantity of standeess is only 2 there
            standee_type=Complexity.MODERATE,
            blank_comp_count=6,
            color_comp_count=14,
            full_out_source=True,
            partial_out_source=False,
            inhouse=False,
        )
        total_cost = project.get_static_cost()
        self.assertAlmostEqual(total_cost, 307270.99, delta=1.0)


    def test_static_cost_calculator_sinner_standee(self):
        elements = [
            Element(name="BACKER", length=84, width=63, complexity=Complexity.SIMPLE),
            Element(name="MBJ W/ HAT", length=78, width=27, complexity=Complexity.COMPLEX),
            Element(name="MBJ W/GUN", length=72.97, width=24, complexity=Complexity.COMPLEX),
            Element(name="BASE", length=18.96, width=68.04, complexity=Complexity.SIMPLE),
        ]
        _, bin_dict = print_form_calculator(elements, 118)
        project = Project(
            name="Sinner standee (test)",
            print_forms=list(bin_dict.values()),
            num_standees=118, # iQuote project qty; spreadsheet "STANDEE PRINT-NLANK FORMS DATA" says quantity of standeess is only 10 there
            standee_type=Complexity.MODERATE,
            blank_comp_count=4,
            color_comp_count=4,
            full_out_source=False,
            partial_out_source=False,
            inhouse=True,
        )
        total_cost = project.get_static_cost()
        self.assertAlmostEqual(total_cost, 8,884.20, delta=1.0)