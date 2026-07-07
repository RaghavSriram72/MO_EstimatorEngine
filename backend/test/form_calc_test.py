import unittest

from lib.classes import (
    Complexity,
    Element,
)
from lib.globals import BUSMARK_FORM_LENGTH, BUSMARK_FORM_WIDTH, BUSMARK_PADDING
from lib.print_form_calculator import print_form_calculator


class TestPrintFormCalculator(unittest.TestCase):
    """Tests for print form calculation of standee projects."""

    def _assert_elements_fit_on_form(self, form):
        for element in form.elements:
            self.assertLessEqual(element.length, BUSMARK_FORM_LENGTH)
            self.assertLessEqual(element.width, BUSMARK_FORM_WIDTH)

    def test_print_form_calculator_returns_no_bins_for_empty_input(self):
        """Test print form calculation with no input elements."""
        elements, bin_dict = print_form_calculator([])

        self.assertEqual(elements, {})
        self.assertEqual(bin_dict, {})

    def test_print_form_calculator_keeps_boundary_fitting_element_on_one_form(self):
        """Test print form calculation for an element that fits after padding."""
        elements = [
            Element(name="fit", length=79.75, width=59.75, complexity=Complexity.COMPLEX),
        ]
        packed_elements, bin_dict = print_form_calculator(elements, form_width=BUSMARK_FORM_WIDTH, form_length=BUSMARK_FORM_LENGTH, padding=BUSMARK_PADDING)

        self.assertEqual(len(bin_dict), 1)
        self.assertEqual(sorted(packed_elements), ["fit"])
        self.assertEqual(elements[0].length, 80.0)
        self.assertEqual(elements[0].width, 60.0)

        form = next(iter(bin_dict.values()))
        self.assertEqual([element.name for element in form.elements], ["fit"])
        self.assertEqual(form.complexity, Complexity.COMPLEX)
        self._assert_elements_fit_on_form(form)

    def test_print_form_calculator_keeps_exact_boundary_element_on_one_form(self):
        """Test print form calculation for an element that lands exactly on the form boundary."""
        elements = [
            Element(name="edge", length=79.75, width=59.75, complexity=Complexity.SIMPLE),
        ]
        packed_elements, bin_dict = print_form_calculator(elements, form_width=BUSMARK_FORM_WIDTH, form_length=BUSMARK_FORM_LENGTH, padding=BUSMARK_PADDING)

        self.assertEqual(len(bin_dict), 1)
        self.assertEqual(sorted(packed_elements), ["edge"])

        form = next(iter(bin_dict.values()))
        self.assertEqual([element.name for element in form.elements], ["edge"])
        self.assertEqual(form.complexity, Complexity.SIMPLE)
        self.assertEqual(elements[0].length, 80.0)
        self.assertEqual(elements[0].width, 60.0)
        self._assert_elements_fit_on_form(form)

    def test_print_form_calculator_splits_long_element_across_two_forms(self):
        """Test print form calculation for an element that must split by length."""
        elements = [
            Element(name="monkey", length=90, width=60, complexity=Complexity.COMPLEX),
        ]
        packed_elements, bin_dict = print_form_calculator(elements, form_width=BUSMARK_FORM_WIDTH, form_length=BUSMARK_FORM_LENGTH, padding=BUSMARK_PADDING)

        self.assertEqual(len(bin_dict), 2)
        self.assertEqual(sorted(packed_elements), ["monkey_0", "monkey_1"])

        packed_dimensions = [
            sorted((round(element.length, 2), round(element.width, 2))) for element in packed_elements.values()
        ]
        self.assertEqual(packed_dimensions, [[45.25, 60.25], [45.25, 60.25]])
        self.assertTrue(all(element.complexity == Complexity.COMPLEX for element in packed_elements.values()))

        for form in bin_dict.values():
            self.assertEqual(len(form.elements), 1)
            self._assert_elements_fit_on_form(form)

    def test_print_form_calculator_preserves_complexity_on_split_elements(self):
        """Test print form calculation preserves complexity on all split pieces."""
        elements = [
            Element(name="poster", length=90, width=60, complexity=Complexity.MODERATE),
        ]
        packed_elements, bin_dict = print_form_calculator(elements, form_width=BUSMARK_FORM_WIDTH, form_length=BUSMARK_FORM_LENGTH, padding=BUSMARK_PADDING)

        self.assertEqual(len(bin_dict), 2)
        self.assertTrue(all(element.complexity == Complexity.MODERATE for element in packed_elements.values()))
        self.assertEqual(sorted(packed_elements), ["poster_0", "poster_1"])

        for form in bin_dict.values():
            self.assertEqual(len(form.elements), 1)
            self.assertEqual(form.complexity, Complexity.MODERATE)

    def test_print_form_calculator_splits_wide_element_across_two_forms(self):
        """Test print form calculation for an element that must split by width."""
        elements = [
            Element(name="banner", length=60, width=90, complexity=Complexity.MODERATE),
        ]
        packed_elements, bin_dict = print_form_calculator(elements, form_width=BUSMARK_FORM_WIDTH, form_length=BUSMARK_FORM_LENGTH, padding=BUSMARK_PADDING)

        self.assertEqual(len(bin_dict), 2)
        self.assertEqual(sorted(packed_elements), ["banner_0", "banner_1"])

        packed_dimensions = [
            sorted((round(element.length, 2), round(element.width, 2))) for element in packed_elements.values()
        ]
        self.assertEqual(packed_dimensions, [[45.25, 60.25], [45.25, 60.25]])
        self.assertTrue(all(element.complexity == Complexity.MODERATE for element in packed_elements.values()))

        for form in bin_dict.values():
            self.assertEqual(len(form.elements), 1)
            self._assert_elements_fit_on_form(form)

    def test_print_form_calculator_packs_multiple_elements_into_one_form_and_keeps_highest_complexity(self):
        """Test print form calculation for multiple elements that fit on one form."""
        elements = [
            Element(name="simple", length=20, width=20, complexity=Complexity.SIMPLE),
            Element(name="moderate", length=20, width=20, complexity=Complexity.MODERATE),
            Element(name="complex", length=20, width=20, complexity=Complexity.COMPLEX),
        ]
        packed_elements, bin_dict = print_form_calculator(elements, form_width=BUSMARK_FORM_WIDTH, form_length=BUSMARK_FORM_LENGTH, padding=BUSMARK_PADDING)

        self.assertEqual(len(bin_dict), 1)
        self.assertCountEqual(packed_elements, ["simple", "moderate", "complex"])

        form = next(iter(bin_dict.values()))
        self.assertCountEqual([element.name for element in form.elements], ["simple", "moderate", "complex"])
        self.assertEqual(form.complexity, Complexity.COMPLEX)
        self._assert_elements_fit_on_form(form)
