from dataclasses import dataclass

import numpy as np
from scipy.optimize import curve_fit

from lib.classes import Complexity, Form, MidnightOilDB
from lib.globals import BUSMARK_PADDING, DB_LABELS, PRINT_FORM_LENGTH, UNIT_MAP

STANDEE_MAP = {
    Complexity.SIMPLE: "Simple Standee",
    Complexity.MODERATE: "Moderate Standee",
    Complexity.COMPLEX: "Complex Standee",
}


@dataclass
class Project:
    """Class to represent a overall standee project."""

    db: MidnightOilDB
    name: str
    print_forms: list[Form]
    num_standees: int
    standee_type: Complexity

    def __post_init__(self):
        self.standee_key = STANDEE_MAP[self.standee_type]
        self._calculate_universal_costs()

    @property
    def total_universal_cost(self) -> float:
        """Calculate the total universal cost for the project."""
        return (
            +self.imposition_cost
            + self.blank_comp_cost
            + self.color_comp_cost
            + self.engineering_design_cost
            + self.hardware_cost
        )

    @property
    def total_cost(self) -> float:
        """Calculate the total cost of the project, including both universal and scenario-specific costs."""
        raise NotImplementedError("Subclasses must implement total_cost property")

    def calculate_cost(self, **kwargs) -> float:
        """Calculate the total cost of the project, including both universal and scenario-specific costs."""
        raise NotImplementedError("Subclasses must implement calculate_cost method")

    def to_dict(self) -> dict:
        """Return common project/scenario fields as a dictionary."""
        return {k: v for k, v in self.__dict__.items() if not k.startswith("_") and k != "db"}

    def _calculate_universal_costs(
        self,
        *,
        num_standees: int = 0,
        print_forms_per_standee: int = 0,
        structure_forms_per_standee: int = 0,
        num_overs: int = 0,
        imposition_hours: float = 0,
        blank_comp_count: float = 1,
        color_comp_count: float = 1,
    ) -> float:
        self.num_standees = num_standees or self.num_standees
        db = self.db
        # corrugate cost calculation
        self.print_forms_per_standee = print_forms_per_standee or len(self.print_forms)
        self.structure_forms_per_standee = structure_forms_per_standee or db.get_structure_forms_per_standee(
            self.print_forms_per_standee
        )
        self.blank_forms_per_standee = self.print_forms_per_standee + self.structure_forms_per_standee
        # imposition cost
        self.imposition_hours = imposition_hours or self.print_forms_per_standee
        # imposition_rate = db.get_standee_data(self.standee_key, "imposition_cost_per_hour")
        imposition_rate = db.get_unit_cost(DB_LABELS["imposition_labor"])
        self.imposition_cost = imposition_rate * self.imposition_hours

        # hardware cost calculation
        self.hardware_cost = db.get_standee_data(self.standee_key, "hardware_cost") * self.num_standees

        # misc costs and project vars
        self.overs = num_overs or db.get_overs(self.num_standees)
        self.print_form_total = (
            self.print_forms_per_standee * self.num_standees + self.overs * self.print_forms_per_standee
        )
        self.engineering_design_cost = db.get_standee_data(self.standee_key, "engineering_design_cost_per_project")
        self.blank_comp_count = blank_comp_count
        self.blank_comp_cost = db.get_unit_cost(DB_LABELS["blank_comp"]) * self.blank_comp_count
        self.color_comp_count = color_comp_count
        self.color_comp_cost = db.get_unit_cost(DB_LABELS["color_comp"]) * self.color_comp_count
        return self.total_universal_cost

    # Helpers
    def _print_form_cost(self, db, print_material_name: str) -> float:
        print_form_material = db.get_unit_cost_entry(print_material_name)
        print_form_unit = print_form_material["unit"]  # linear_foot
        linear_inches = 0
        if print_form_unit != "linear_foot":
            print_form_cost = print_form_material["cost"] * UNIT_MAP[print_form_unit] * self.print_form_total
        elif print_form_unit == "linear_foot":
            linear_inches = self._get_print_form_linear_inches()
        else:
            raise ValueError(f"Unsupported unit type '{print_form_unit}' for print material '{print_material_name}'")

        if "roll" in print_material_name:
            linear_inches += BUSMARK_PADDING * self.num_standees
            print_form_cost = print_form_material["cost"] * UNIT_MAP[print_form_unit] * linear_inches

        # ! do we need hi-tack if theyre doing mounting??
        # add hi-tack if not busmark
        else:
            hi_tack_material = db.get_unit_cost_entry(DB_LABELS["roll_hi_tack"])
            hi_tack_unit = hi_tack_material["unit"]
            hi_tack_cost = hi_tack_material["cost"] * UNIT_MAP[hi_tack_unit] * linear_inches
            print_form_cost = print_form_material["cost"] * UNIT_MAP[print_form_unit] * linear_inches
            print_form_cost += hi_tack_cost
        return print_form_cost

    def _get_print_form_linear_inches(self) -> int:
        return int(PRINT_FORM_LENGTH) * self.print_form_total

    def _setup_time(self, unit_cost_entry: dict, forms: int) -> float:
        return unit_cost_entry["setup_time"] * forms

    def _machine_time(self, db, machine_name: str, linear_inches: float) -> float:
        machine_entry = db.get_unit_cost_entry(machine_name)
        throughput: int = machine_entry["throughput"]
        throughput_unit: str = machine_entry["throughput_unit"]
        machine_time: float = linear_inches / (throughput / UNIT_MAP[throughput_unit]) + self._setup_time(
            machine_entry, self.print_forms_per_standee
        )
        return machine_time

    def _machine_cost(self, db, machine_name: str, machine_hours: float) -> float:
        machine_entry = db.get_unit_cost_entry(machine_name)
        machine_cost = machine_entry["cost"] * UNIT_MAP[machine_entry["unit"]] * machine_hours
        return machine_cost

    def _zund_hours(self, db) -> float:
        # combination of linear inches and provided minute estimates
        zund_linear_inches = sum(form.get_linear_inches() for form in self.print_forms)
        print_zund_hours = self._machine_time(db, DB_LABELS["zund_cutter"], zund_linear_inches)
        structure_zund_hours = (
            db.get_standee_data(self.standee_key, "zund_blank_form_minutes")
            * self.structure_forms_per_standee
            * self.num_standees
        ) / 60

        return (
            print_zund_hours
            + structure_zund_hours
            + self._setup_time(db.get_unit_cost_entry(DB_LABELS["zund_cutter"]), self.blank_forms_per_standee)
        )

    def _shipping_box_and_label_cost(self, db) -> tuple[float, float]:
        shipping_box_cost = db.get_unit_cost(DB_LABELS["shipping_box"]) * self.num_standees
        desc_label_cost = db.get_unit_cost(DB_LABELS["desc_label"])
        shipping_label_cost = db.get_unit_cost(DB_LABELS["shipping_label"])
        label_cost = (2 * desc_label_cost + shipping_label_cost) * self.num_standees
        return shipping_box_cost, label_cost

    def _instruction_sheet_cost(self, db) -> float:
        instruction_sheet_cost = (
            db.get_standee_data(self.standee_key, "instruction_sheet_total_cost") * self.num_standees
        )
        return instruction_sheet_cost

    def _die_cost(self, db) -> float:
        die_unit_cost = db.get_unit_cost(DB_LABELS["die_cost"])
        die_complexity_map = {
            complexity: db.get_standee_data(term, "cutting_die_inches_multiplier")
            for complexity, term in STANDEE_MAP.items()
        }
        return sum(form.get_die_cost(die_complexity_map, die_unit_cost) for form in self.print_forms)

    def _get_supplier_cost(self, db, supplier: str, material: str, num_forms: int) -> float:
        supplier_data = db.get_supplier_values(supplier, material)
        amounts = supplier_data["amounts"]
        costs = supplier_data["costs"]
        a_guess = max(costs)
        b_guess = np.log(costs[0] / costs[-1]) / np.log(amounts[0] / amounts[-1])
        c_guess = min(costs) * 0.8
        params, _ = curve_fit(lambda x, a, b, c: a * x**b + c, amounts, costs, p0=[a_guess, b_guess, c_guess])
        scale, power, floor = params
        cost_per_unit = scale * num_forms**power + floor
        return cost_per_unit * num_forms

    def _get_num_corrugate_forms(self) -> int:
        return (self.print_forms_per_standee + self.structure_forms_per_standee) * self.num_standees + (
            self.print_forms_per_standee * self.overs
        )
