from typing import override

from lib.classes import Complexity, Form, MidnightOilDB
from lib.globals import FORM_LENGTH, UNIT_MAP

DIE_COST = "die_cost"
BLANK_COMP = "blank_comp"
COLOR_COMP = "color_comp"
CORRUGATE = "blank_corrugate"
FULL_OUT_SOURCE = "print_mount_diecut_assembly_kitting"
EXTERNAL_MOUNT_ASSEMBLY = "mount_diecut_assembly_kitting"
EXTERNAL_ASSEMBLY = "assembly_kitting"
DESCRIPTION_LABEL = "description_label"
SHIPPING_LABEL = "shipping_label"
SHIPPING_BOX = "shipping_box"
PALLET = "pallet"
PALLET_LABOR = "pallet_labor"
ROLL_95 = "roll_95_pound"
SHEET_95 = "sheet_95_pound"
ROLL_HI_TACK = "roll_hi_tack"
ROLL_BUSMARK = "roll_busmark"
IMPOSITION_LABOR = "imposition_labor"
INSTRUCTION_SHEET = "instruction_sheet"
ZUND_CUT_COST = "zund_cut_cost"

STANDEE_MAP = {
    Complexity.SIMPLE: "Simple Standee",
    Complexity.MODERATE: "Moderate Standee",
    Complexity.COMPLEX: "Complex Standee",
}


class Project:
    """Class to represent a overall standee project."""

    def __init__(
        self,
        name: str,
        print_forms: list[Form],
        num_standees: int,
        standee_type: Complexity,
    ):
        self.name = name
        self.standee_type = standee_type
        self.standee_key = STANDEE_MAP[standee_type]
        self.print_forms = print_forms
        self.num_standees = num_standees
        self._calculate_universal_costs()

    @property
    def total_universal_cost(self) -> float:
        """Calculate the total universal cost for the project."""
        return (
            self.corrugate_cost
            + self.imposition_cost
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

    def _calculate_universal_costs(
        self,
        *,
        num_standees: int = 0,
        print_forms_per_standee: int = 0,
        structure_forms_per_standee: int = 0,
        imposition_hours: float = 0,
        blank_comp_count: float = 0,
        color_comp_count: float = 0,
    ) -> float:
        
        self.num_standees = num_standees or self.num_standees
        with MidnightOilDB() as db:
            # corrugate cost calculation
            self.print_forms_per_standee = print_forms_per_standee or len(self.print_forms)
            self.structure_forms_per_standee = structure_forms_per_standee or db.get_structure_forms_per_standee(
                self.print_forms_per_standee
            )
            self.blank_forms_per_standee = self.print_forms_per_standee + self.structure_forms_per_standee
            self.corrugate_cost = db.get_unit_cost(CORRUGATE) * self.blank_forms_per_standee * self.num_standees
            # imposition cost
            self.imposition_hours = imposition_hours or self.print_forms_per_standee
            imposition_rate = db.get_standee_data(self.standee_key, "imposition_cost_per_hour")
            self.imposition_cost = imposition_rate * self.imposition_hours

            # hardware cost calculation
            self.hardware_cost = db.get_standee_data(self.standee_key, "hardware_cost") * self.num_standees

            # misc costs
            self.engineering_design_cost = db.get_standee_data(self.standee_key, "engineering_design_cost_per_project")
            if blank_comp_count:
                self.blank_comp_count = blank_comp_count
                self.blank_comp_cost = db.get_unit_cost(BLANK_COMP) * self.blank_comp_count
            if color_comp_count:
                self.color_comp_count = color_comp_count
                self.color_comp_cost = db.get_unit_cost(COLOR_COMP) * self.color_comp_count
        return self.total_universal_cost


class Scenario1(Project):
    """Scenario 1: Internal Print, Internal Finishing, Packed out."""

    def __init__(self, name: str, print_forms: list[Form], num_standees: int, standee_type: Complexity):
        super().__init__(name, print_forms, num_standees, standee_type)

    @override
    def calculate_cost(
        self,
        *,
        num_standees: int = 0,
        print_forms_per_standee: int = 0,
        structure_forms_per_standee: int = 0,
        imposition_hours: float = 0,
        blank_comp_count: float = 0,
        color_comp_count: float = 0,
        zund_hours: float = 0,
        **kwargs,
    ) -> float:
        super()._calculate_universal_costs(
            num_standees=num_standees,
            print_forms_per_standee=print_forms_per_standee,
            structure_forms_per_standee=structure_forms_per_standee,
            imposition_hours=imposition_hours,
            blank_comp_count=blank_comp_count,
            color_comp_count=color_comp_count,
        )
        with MidnightOilDB() as db:
            # print form cost calculation
            self.print_form_cost = _print_form_cost(db, ROLL_BUSMARK, self.print_forms_per_standee, self.num_standees)

            # zund cost calculation
            self.zund_hours = zund_hours or _zund_hours(
                db, self.standee_key, self.print_forms_per_standee, self.blank_forms_per_standee, self.num_standees
            )
            self.zund_cut_cost = self.zund_hours * db.get_unit_cost(ZUND_CUT_COST)

            # shipping box and label cost calculation
            self.shipping_box_cost, self.label_cost = _shipping_box_and_label_cost(db, self.num_standees)

            # instruction sheet cost calculation
            self.instruction_sheet_cost = _instruction_sheet_cost(db, self.standee_key, self.num_standees)

        return self.total_cost

    @property
    def total_cost(self) -> float:
        """Calculate the total cost of the project, including both universal and scenario-specific costs."""
        return (
            self.total_universal_cost
            + self.print_form_cost
            + self.zund_cut_cost
            + self.shipping_box_cost
            + self.label_cost
            + self.instruction_sheet_cost
        )


class Scenario2(Project):
    """Scenario 2: Internal Print, Internal Finishing, Assembled."""

    def __init__(self, name: str, print_forms: list[Form], num_standees: int, standee_type: Complexity):
        super().__init__(name, print_forms, num_standees, standee_type)

    @override
    def calculate_cost(
        self,
        *,
        num_standees: int = 0,
        print_forms_per_standee: int = 0,
        structure_forms_per_standee: int = 0,
        imposition_hours: float = 0,
        blank_comp_count: float = 0,
        color_comp_count: float = 0,
        zund_hours: float = 0,
        **kwargs
    ) -> float:
        super()._calculate_universal_costs(
            num_standees=num_standees,
            print_forms_per_standee=print_forms_per_standee,
            structure_forms_per_standee=structure_forms_per_standee,
            imposition_hours=imposition_hours,
            blank_comp_count=blank_comp_count,
            color_comp_count=color_comp_count,
        )
        with MidnightOilDB() as db:
            # print form cost calculation
            self.print_form_cost = _print_form_cost(db, ROLL_BUSMARK, self.print_forms_per_standee, self.num_standees)

            # zund cost calculation
            self.zund_hours = zund_hours or _zund_hours(
                db, self.standee_key, self.print_forms_per_standee, self.blank_forms_per_standee, self.num_standees
            )
            self.zund_cut_cost = self.zund_hours * db.get_unit_cost(ZUND_CUT_COST)

            # shipping box and label cost calculation
            self.shipping_box_cost, self.label_cost = _shipping_box_and_label_cost(db, self.num_standees)

        return self.total_cost

    @property
    def total_cost(self) -> float:
        """Calculate the total cost of the project, including both universal and scenario-specific costs."""
        return (
            self.total_universal_cost
            + self.print_form_cost
            + self.zund_cut_cost
            + self.shipping_box_cost
            + self.label_cost
        )


class Scenario3(Project):
    """Scenario 3: Internal Print, Internal Finishing, External Assembly."""

    def __init__(self, name: str, print_forms: list[Form], num_standees: int, standee_type: Complexity):
        super().__init__(name, print_forms, num_standees, standee_type)

    @override
    def calculate_cost(
        self,
        *,
        num_standees: int = 0,
        print_forms_per_standee: int = 0,
        structure_forms_per_standee: int = 0,
        imposition_hours: float = 0,
        blank_comp_count: float = 0,
        color_comp_count: float = 0,
        zund_hours: float = 0,
        pallet_count: int = 0,
        freight_cost: float = 0,
        **kwargs
    ) -> float:
        super()._calculate_universal_costs(
            num_standees=num_standees,
            print_forms_per_standee=print_forms_per_standee,
            structure_forms_per_standee=structure_forms_per_standee,
            imposition_hours=imposition_hours,
            blank_comp_count=blank_comp_count,
            color_comp_count=color_comp_count,
        )
        with MidnightOilDB() as db:
            # print form cost calculation
            self.print_form_cost = _print_form_cost(db, ROLL_BUSMARK, self.print_forms_per_standee, self.num_standees)

            # zund cost calculation
            self.zund_hours = zund_hours or _zund_hours(
                db, self.standee_key, self.print_forms_per_standee, self.blank_forms_per_standee, self.num_standees
            )
            self.zund_cut_cost = self.zund_hours * db.get_unit_cost(ZUND_CUT_COST)

            # shipping box and label cost calculation
            self.shipping_box_cost, self.label_cost = _shipping_box_and_label_cost(db, self.num_standees)

            # instruction sheet cost calculation
            self.instruction_sheet_cost = _instruction_sheet_cost(db, self.standee_key, self.num_standees)

            # pallet cost calculation
            self.pallet_count = pallet_count or (self.num_standees // db.get_unit_cost(PALLET))
            self.pallet_cost = (
                db.get_unit_cost(PALLET_LABOR) * self.pallet_count + db.get_unit_cost(PALLET) * self.pallet_count
            )
            # freight cost calculation
            self.freight_cost = freight_cost or db.get_unit_cost(EXTERNAL_ASSEMBLY)
        return self.total_cost

    @property
    def total_cost(self) -> float:
        """Calculate the total cost of the project, including both universal and scenario-specific costs."""
        return (
            self.total_universal_cost
            + self.print_form_cost
            + self.zund_cut_cost
            + self.shipping_box_cost
            + self.label_cost
            + self.instruction_sheet_cost
            + self.pallet_cost
            + self.freight_cost
        )


class Scenario4(Project):
    """Scenario 4: Internal Print, External Mount & Die Cut, External Assembly."""

    def __init__(self, name: str, print_forms: list[Form], num_standees: int, standee_type: Complexity):
        super().__init__(name, print_forms, num_standees, standee_type)

    @override
    def calculate_cost(
        self,
        *,
        num_standees: int = 0,
        print_forms_per_standee: int = 0,
        structure_forms_per_standee: int = 0,
        print_material_name: str = "",
        imposition_hours: float = 0,
        blank_comp_count: float = 0,
        color_comp_count: float = 0,
        pallet_count: int = 0,
        freight_cost: float = 0,
        die_cost: float = 0,
        **kwargs
    ) -> float:
        super()._calculate_universal_costs(
            num_standees=num_standees,
            print_forms_per_standee=print_forms_per_standee,
            structure_forms_per_standee=structure_forms_per_standee,
            imposition_hours=imposition_hours,
            blank_comp_count=blank_comp_count,
            color_comp_count=color_comp_count,
        )
        with MidnightOilDB() as db:
            # print form cost calculation
            if print_material_name:
                self.print_material = db.get_unit_cost_entry(print_material_name)
            self.print_form_cost = _print_form_cost(
                db, print_material_name or ROLL_95, self.print_forms_per_standee, self.num_standees
            )

            # shipping box and label cost calculation
            self.shipping_box_cost, self.label_cost = _shipping_box_and_label_cost(db, self.num_standees)

            # instruction sheet cost calculation
            self.instruction_sheet_cost = _instruction_sheet_cost(db, self.standee_key, self.num_standees)

            # pallet cost calculation
            self.pallet_count = pallet_count or (self.num_standees // db.get_unit_cost(PALLET))
            self.pallet_cost = (
                db.get_unit_cost(PALLET_LABOR) * self.pallet_count + db.get_unit_cost(PALLET) * self.pallet_count
            )
            # freight cost calculation
            self.freight_cost = freight_cost or db.get_unit_cost(EXTERNAL_MOUNT_ASSEMBLY)

            # die cost calculation
            self.die_cost = die_cost or _die_cost(db, self.print_forms)

        return self.total_cost

    @property
    def total_cost(self) -> float:
        """Calculate the total cost of the project, including both universal and scenario-specific costs."""
        return (
            self.total_universal_cost
            + self.print_form_cost
            + self.shipping_box_cost
            + self.label_cost
            + self.instruction_sheet_cost
            + self.pallet_cost
            + self.freight_cost
            + self.die_cost
        )


class Scenario5(Project):
    """Scenario 5: External Print, External Finishing, Packed out (currently incomplete)."""

    def __init__(self, name: str, print_forms: list[Form], num_standees: int, standee_type: Complexity):
        super().__init__(name, print_forms, num_standees, standee_type)

    @override
    def calculate_cost(
        self,
        *,
        num_standees: int = 0,
        print_forms_per_standee: int = 0,
        structure_forms_per_standee: int = 0,
        imposition_hours: float = 0,
        blank_comp_count: float = 0,
        color_comp_count: float = 0,
        freight_cost: float = 0,
        die_cost: float = 0,
        **kwargs
    ) -> float:
        super()._calculate_universal_costs(
            num_standees=num_standees,
            print_forms_per_standee=print_forms_per_standee,
            structure_forms_per_standee=structure_forms_per_standee,
            imposition_hours=imposition_hours,
            blank_comp_count=blank_comp_count,
            color_comp_count=color_comp_count,
        )
        with MidnightOilDB() as db:
            # instruction sheet cost calculation
            self.instruction_sheet_cost = _instruction_sheet_cost(db, self.standee_key, self.num_standees)

            # freight cost calculation
            self.freight_cost = freight_cost or db.get_unit_cost(FULL_OUT_SOURCE)

            # die cost calculation
            self.die_cost = die_cost or _die_cost(db, self.print_forms)

        return self.total_cost

    @property
    def total_cost(self) -> float:
        """Calculate the total cost of the project, including both universal and scenario-specific costs."""
        return self.total_universal_cost + self.instruction_sheet_cost + self.freight_cost + self.die_cost


# Helpers
def _print_form_cost(db, print_material_name: str, print_forms_per_standee: int, num_standees: int) -> float:
    print_form_material = db.get_unit_cost_entry(print_material_name)
    print_form_total = print_forms_per_standee * num_standees
    print_form_unit = print_form_material["unit"]
    print_form_cost = 0
    if print_form_unit == "each":
        print_form_cost = print_form_material["cost"] * print_form_total
    elif print_form_unit == "linear_foot":
        print_form_material["cost"] *= UNIT_MAP[print_form_unit]
        print_form_cost = print_form_material["cost"] * FORM_LENGTH * print_form_total
    else:
        raise ValueError(f"Unsupported unit type '{print_form_unit}' for print material '{print_material_name}'")
    # add hi-tack if not busmark
    if print_material_name != ROLL_BUSMARK:
        hi_tack_material = db.get_unit_cost_entry(ROLL_HI_TACK)
        hi_tack_unit = hi_tack_material["unit"]
        hi_tack_cost = hi_tack_material["cost"] * UNIT_MAP[hi_tack_unit] * FORM_LENGTH * print_form_total
        print_form_cost += hi_tack_cost
    return print_form_cost


def _zund_hours(
    db, standee_key: str, print_forms_per_standee: int, blank_forms_per_standee: int, num_standees: int
) -> float:
    print_zund_hours = (
        db.get_standee_data(standee_key, "zund_print_form_minutes") * print_forms_per_standee * num_standees
    ) / 60
    blank_zund_hours = (
        db.get_standee_data(standee_key, "zund_blank_form_minutes") * blank_forms_per_standee * num_standees
    ) / 60

    return print_zund_hours + blank_zund_hours


def _shipping_box_and_label_cost(db, num_standees: int) -> tuple[float, float]:
    shipping_box_cost = db.get_unit_cost(SHIPPING_BOX) * num_standees
    desc_label_cost = db.get_unit_cost(DESCRIPTION_LABEL)
    handling_label_cost = db.get_unit_cost(SHIPPING_LABEL)
    label_cost = (2 * desc_label_cost + handling_label_cost) * num_standees
    return shipping_box_cost, label_cost


def _instruction_sheet_cost(db, standee_key: str, num_standees: int) -> float:
    instruction_sheet_cost = db.get_standee_data(standee_key, "instruction_sheet_total_cost") * num_standees
    return instruction_sheet_cost


def _die_cost(db, print_forms: list[Form]) -> float:
    die_unit_cost = db.get_unit_cost("die_cost")
    die_complexity_map = {
        complexity: db.get_standee_data(term, "cutting_die_inches_multiplier")
        for complexity, term in STANDEE_MAP.items()
    }
    return sum(form.get_die_cost(die_complexity_map, die_unit_cost) for form in print_forms)
