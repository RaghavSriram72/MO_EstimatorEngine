import unittest

from lib.classes import Complexity, Element
from lib.print_form_calculator import print_form_calculator


class TestPrintFormCalculatorBinCount(unittest.TestCase):
    """Smoke test for the bin count of a specific size mix."""

    def test_print_form_calculator_reports_bin_count_for_requested_sizes(self):
        """Print the number of bins used for the requested dimensions."""
        elements = [
            Element(name="75.88x62.97", length=75.88, width=62.97, complexity=Complexity.SIMPLE),
            Element(name="2.59x17.03", length=2.59, width=17.03, complexity=Complexity.SIMPLE),
            Element(name="2.89x8.59", length=2.89, width=8.59, complexity=Complexity.SIMPLE),
            Element(name="7.16x12.97", length=7.16, width=12.97, complexity=Complexity.SIMPLE),
            Element(name="16.91x23.59", length=16.91, width=23.59, complexity=Complexity.SIMPLE),
            Element(name="87x60", length=87.0, width=60.0, complexity=Complexity.SIMPLE),
        ]

        packed_elements, bin_dict = print_form_calculator(elements)

        print(f"bin count: {len(bin_dict)}")
        for bin_id in sorted(bin_dict):
            print(f"bin {bin_id}: {[element.name for element in bin_dict[bin_id].elements]}")

        self.assertEqual(len(bin_dict), 4)
        self.assertGreaterEqual(len(packed_elements), len(elements))
