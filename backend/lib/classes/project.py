from typing import override

from scipy.optimize import curve_fit

from lib.classes import Complexity, Form, MidnightOilDB
from lib.globals import BUSMARK_PADDING, PRINT_FORM_LENGTH, UNIT_MAP

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
ZUND_CUTTER = "zund_cutter"
RHO_512R = "durst_rho_512R"
RHO_1312 = "durst_rho_1312"
ROLLX = "roll-x"
B_WHITE = "b_white_1_s"
FOSTERS_PRINT_FORM = "fosters_print_form"
FOSTERS = "fosters"
PQ = "pq"

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
        return {k: v for k, v in self.__dict__.items() if not k.startswith("_")}

    def _calculate_universal_costs(
        self,
        *,
        num_standees: int = 0,
        print_forms_per_standee: int = 0,
        structure_forms_per_standee: int = 0,
        num_overs: int = 0,
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
            # imposition cost
            self.imposition_hours = imposition_hours or self.print_forms_per_standee
            # imposition_rate = db.get_standee_data(self.standee_key, "imposition_cost_per_hour")
            imposition_rate = db.get_unit_cost(IMPOSITION_LABOR)
            self.imposition_cost = imposition_rate * self.imposition_hours

            # hardware cost calculation
            self.hardware_cost = db.get_standee_data(self.standee_key, "hardware_cost") * self.num_standees

            # misc costs and project vars
            self.overs = num_overs or db.get_overs(self.num_standees)
            self.engineering_design_cost = db.get_standee_data(self.standee_key, "engineering_design_cost_per_project")
            self.blank_comp_cost = 0.0
            self.color_comp_cost = 0.0
            if blank_comp_count:
                self.blank_comp_count = blank_comp_count
                self.blank_comp_cost = db.get_unit_cost(BLANK_COMP) * self.blank_comp_count
            if color_comp_count:
                self.color_comp_count = color_comp_count
                self.color_comp_cost = db.get_unit_cost(COLOR_COMP) * self.color_comp_count
        return self.total_universal_cost

    # Helpers
    def _print_form_cost(self, db, print_material_name: str) -> float:
        pfps = self.print_forms_per_standee
        ns = self.num_standees
        print_form_material = db.get_unit_cost_entry(print_material_name)
        print_form_total = pfps * ns + db.get_overs(ns)
        print_form_unit = print_form_material["unit"]  # linear_foot
        print_form_cost = 0
        linear_inches = 0
        if print_form_unit != "linear_foot":
            print_form_cost = print_form_material["cost"] * UNIT_MAP[print_form_unit] * print_form_total
        elif print_form_unit == "linear_foot":
            # use 85 for form length, plus 2 for waste
            linear_inches = self._get_form_material_linear_inches()
        else:
            raise ValueError(f"Unsupported unit type '{print_form_unit}' for print material '{print_material_name}'")

        if print_material_name == ROLL_BUSMARK:
            linear_inches += BUSMARK_PADDING * pfps
            print_form_cost = print_form_material["cost"] * UNIT_MAP[print_form_unit] * linear_inches

        # ! do we need hi-tack if theyre doing mounting??
        # add hi-tack if not busmark
        if print_material_name != ROLL_BUSMARK:
            hi_tack_material = db.get_unit_cost_entry(ROLL_HI_TACK)
            hi_tack_unit = hi_tack_material["unit"]
            hi_tack_cost = hi_tack_material["cost"] * UNIT_MAP[hi_tack_unit] * linear_inches
            print_form_cost = print_form_material["cost"] * UNIT_MAP[print_form_unit] * linear_inches
            print_form_cost += hi_tack_cost
        return print_form_cost

    def _get_form_material_linear_inches(self) -> int:
        forms_per_standee = self.print_forms_per_standee + self.structure_forms_per_standee
        print_form_total = forms_per_standee * self.num_standees + self.overs
        return int(PRINT_FORM_LENGTH) * (print_form_total + (2 * forms_per_standee))

    def _setup_time(self, unit_cost_entry: dict) -> float:
        return unit_cost_entry["setup_time"] * self.print_forms_per_standee

    def _machine_time(self, db, machine_name: str, linear_inches: float) -> float:
        machine_entry = db.get_unit_cost_entry(machine_name)
        throughput: int = machine_entry["throughput"]
        throughput_unit: str = machine_entry["throughput_unit"]
        machine_time: float = linear_inches / (throughput / UNIT_MAP[throughput_unit]) + self._setup_time(machine_entry)
        return machine_time

    def _machine_cost(self, db, machine_name: str, machine_hours: float) -> float:
        machine_entry = db.get_unit_cost_entry(machine_name)
        machine_cost = machine_entry["cost"] * UNIT_MAP[machine_entry["unit"]] * machine_hours
        return machine_cost

    def _zund_hours(self, db, standee_key: str) -> float:
        print_zund_hours = (
            db.get_standee_data(standee_key, "zund_print_form_minutes")
            * self.print_forms_per_standee
            * self.num_standees
        ) / 60
        structure_zund_hours = (
            db.get_standee_data(standee_key, "zund_blank_form_minutes")
            * self.structure_forms_per_standee
            * self.num_standees
        ) / 60

        return print_zund_hours + structure_zund_hours

    def _shipping_box_and_label_cost(self, db) -> tuple[float, float]:
        shipping_box_cost = db.get_unit_cost(SHIPPING_BOX) * self.num_standees
        desc_label_cost = db.get_unit_cost(DESCRIPTION_LABEL)
        handling_label_cost = db.get_unit_cost(SHIPPING_LABEL)
        label_cost = (2 * desc_label_cost + handling_label_cost) * self.num_standees
        return shipping_box_cost, label_cost

    def _instruction_sheet_cost(self, db) -> float:
        instruction_sheet_cost = (
            db.get_standee_data(self.standee_key, "instruction_sheet_total_cost") * self.num_standees
        )
        return instruction_sheet_cost

    def _die_cost(self, db) -> float:
        die_unit_cost = db.get_unit_cost("die_cost")
        die_complexity_map = {
            complexity: db.get_standee_data(term, "cutting_die_inches_multiplier")
            for complexity, term in STANDEE_MAP.items()
        }
        return sum(form.get_die_cost(die_complexity_map, die_unit_cost) for form in self.print_forms)

    def _get_supplier_cost(self, db, supplier: str, material: str, num_forms: int) -> float:
        supplier_data = db.get_supplier_values(supplier, material)
        amounts = supplier_data["amounts"]
        costs = supplier_data["costs"]

        params, _ = curve_fit(lambda x, a, b: a * x**b, amounts, costs)
        scale, power = params

        return scale * (num_forms) ** power


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
        num_overs: int = 0,
        imposition_hours: float = 0,
        blank_comp_count: float = 0,
        color_comp_count: float = 0,
        zund_hours: float = 0,
        print_hours: float = 0,
        rollx_hours: float = 0,
        **kwargs,
    ) -> float:
        super()._calculate_universal_costs(
            num_standees=num_standees,
            print_forms_per_standee=print_forms_per_standee,
            structure_forms_per_standee=structure_forms_per_standee,
            num_overs=num_overs,
            imposition_hours=imposition_hours,
            blank_comp_count=blank_comp_count,
            color_comp_count=color_comp_count,
        )
        with MidnightOilDB() as db:
            # print form cost calculation
            self.corrugate_cost = db.get_unit_cost(CORRUGATE) * self.blank_forms_per_standee * self.num_standees

            self.print_form_cost = self._print_form_cost(db, ROLL_BUSMARK)
            print_linear_inches = self._get_form_material_linear_inches()
            self.print_hours = print_hours or self._machine_time(db, RHO_512R, print_linear_inches)
            self.print_cost = self._machine_cost(db, RHO_512R, self.print_hours)
            self.rollx_hours = rollx_hours or self._machine_time(db, ROLLX, print_linear_inches)
            self.rollx_cost = self._machine_cost(db, ROLLX, self.rollx_hours)
            # zund cost calculation
            # self.zund_hours = zund_hours or _zund_hours(
            #     db, self.standee_key, self.print_forms_per_standee, self.structure_forms_per_standee, self.num_standee
            # )
            # linear inches for zund is linear inches for all print forms plus one blank form per print form per standee
            zund_linear_inches = sum(form.get_linear_inches() for form in self.print_forms)
            zund_linear_inches *= 2 * self.num_standees
            print(f"Zund linear inches: {zund_linear_inches}")
            self.zund_hours = zund_hours or self._machine_time(db, ZUND_CUTTER, zund_linear_inches)
            self.zund_cut_cost = self._machine_cost(db, ZUND_CUTTER, self.zund_hours)

            # shipping box and label cost calculation
            self.shipping_box_cost, self.label_cost = self._shipping_box_and_label_cost(db)

            # instruction sheet cost calculation
            self.instruction_sheet_cost = self._instruction_sheet_cost(db)

        return self.total_cost

    @property
    def total_cost(self) -> float:
        """Calculate the total cost of the project, including both universal and scenario-specific costs."""
        return (
            self.total_universal_cost
            + self.corrugate_cost
            + self.print_form_cost
            + self.print_cost
            + self.rollx_cost
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
        num_overs: int = 0,
        imposition_hours: float = 0,
        blank_comp_count: float = 0,
        color_comp_count: float = 0,
        zund_hours: float = 0,
        print_hours: float = 0,
        rollx_hours: float = 0,
        **kwargs,
    ) -> float:
        super()._calculate_universal_costs(
            num_standees=num_standees,
            print_forms_per_standee=print_forms_per_standee,
            structure_forms_per_standee=structure_forms_per_standee,
            num_overs=num_overs,
            imposition_hours=imposition_hours,
            blank_comp_count=blank_comp_count,
            color_comp_count=color_comp_count,
        )
        with MidnightOilDB() as db:
            self.corrugate_cost = db.get_unit_cost(CORRUGATE) * self.blank_forms_per_standee * self.num_standees

            # print form cost calculation
            self.print_form_cost = self._print_form_cost(db, ROLL_BUSMARK)
            print_linear_inches = self._get_form_material_linear_inches()
            self.print_hours = print_hours or self._machine_time(db, RHO_512R, print_linear_inches)
            self.print_cost = self._machine_cost(db, RHO_512R, self.print_hours)
            self.rollx_hours = rollx_hours or self._machine_time(db, ROLLX, print_linear_inches)
            self.rollx_cost = self._machine_cost(db, ROLLX, self.rollx_hours)

            # zund cost calculation
            zund_linear_inches = sum(form.get_linear_inches() for form in self.print_forms)
            self.zund_hours = zund_hours or self._machine_time(db, ZUND_CUTTER, zund_linear_inches)
            self.zund_cut_cost = self._machine_cost(db, ZUND_CUTTER, self.zund_hours)

            # shipping box and label cost calculation
            self.shipping_box_cost, self.label_cost = self._shipping_box_and_label_cost(db)

        return self.total_cost

    @property
    def total_cost(self) -> float:
        """Calculate the total cost of the project, including both universal and scenario-specific costs."""
        return (
            self.total_universal_cost
            + self.corrugate_cost
            + self.print_form_cost
            + self.print_cost
            + self.rollx_cost
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
        num_overs: int = 0,
        imposition_hours: float = 0,
        blank_comp_count: float = 0,
        color_comp_count: float = 0,
        print_hours: float = 0,
        rollx_hours: float = 0,
        zund_hours: float = 0,
        pallet_count: int = 0,
        freight_cost: float = 0,
        **kwargs,
    ) -> float:
        super()._calculate_universal_costs(
            num_standees=num_standees,
            print_forms_per_standee=print_forms_per_standee,
            structure_forms_per_standee=structure_forms_per_standee,
            num_overs=num_overs,
            imposition_hours=imposition_hours,
            blank_comp_count=blank_comp_count,
            color_comp_count=color_comp_count,
        )
        with MidnightOilDB() as db:
            self.corrugate_cost = db.get_unit_cost(CORRUGATE) * self.blank_forms_per_standee * self.num_standees

            # print form cost calculation
            self.print_form_cost = self._print_form_cost(db, ROLL_BUSMARK)
            print_linear_inches = self._get_form_material_linear_inches()
            self.print_hours = print_hours or self._machine_time(db, RHO_512R, print_linear_inches)
            self.print_cost = self._machine_cost(db, RHO_512R, self.print_hours)
            self.rollx_hours = rollx_hours or self._machine_time(db, ROLLX, print_linear_inches)
            self.rollx_cost = self._machine_cost(db, ROLLX, self.rollx_hours)

            # zund cost calculation
            zund_linear_inches = sum(form.get_linear_inches() for form in self.print_forms)
            self.zund_hours = zund_hours or self._machine_time(db, ZUND_CUTTER, zund_linear_inches)
            self.zund_cut_cost = self._machine_cost(db, ZUND_CUTTER, self.zund_hours)

            # shipping box and label cost calculation
            self.shipping_box_cost, self.label_cost = self._shipping_box_and_label_cost(db)

            # instruction sheet cost calculation
            self.instruction_sheet_cost = self._instruction_sheet_cost(db)

            # pallet cost calculation
            self.pallet_count = pallet_count or self.blank_forms_per_standee
            self.pallet_material_cost = db.get_unit_cost(PALLET) * self.pallet_count
            self.pallet_labor_cost = db.get_unit_cost(PALLET_LABOR) * self.pallet_count
            self.pallet_cost = self.pallet_material_cost + self.pallet_labor_cost
            # freight cost calculation
            self.freight_cost = freight_cost or db.get_unit_cost(EXTERNAL_ASSEMBLY)
        return self.total_cost

    @property
    def total_cost(self) -> float:
        """Calculate the total cost of the project, including both universal and scenario-specific costs."""
        return (
            self.total_universal_cost
            + self.corrugate_cost
            + self.print_form_cost
            + self.print_cost
            + self.rollx_cost
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
        num_overs: int = 0,
        corrugate_supplier: str = PQ,
        corrugate_material: str = B_WHITE,
        imposition_hours: float = 0,
        blank_comp_count: float = 0,
        color_comp_count: float = 0,
        pallet_count: int = 0,
        freight_cost: float = 0,
        die_cost: float = 0,
        print_hours: float = 0,
        **kwargs,
    ) -> float:
        super()._calculate_universal_costs(
            num_standees=num_standees,
            print_forms_per_standee=print_forms_per_standee,
            structure_forms_per_standee=structure_forms_per_standee,
            num_overs=num_overs,
            imposition_hours=imposition_hours,
            blank_comp_count=blank_comp_count,
            color_comp_count=color_comp_count,
        )
        with MidnightOilDB() as db:
            # corrugate cost calculation
            self.corrugate_supplier = corrugate_supplier
            self.corrugate_material = corrugate_material
            self.corrugate_cost = self._get_supplier_cost(
                db, self.corrugate_supplier, self.corrugate_material, self.num_standees * self.blank_forms_per_standee
            )

            # print form cost calculation
            self.print_form_cost = self._print_form_cost(db, SHEET_95)
            linear_inches = self._get_form_material_linear_inches()
            self.print_hours = print_hours or self._machine_time(db, RHO_1312, linear_inches)
            self.print_cost = self._machine_cost(db, RHO_1312, self.print_hours)
            # shipping box and label cost calculation
            self.shipping_box_cost, self.label_cost = self._shipping_box_and_label_cost(db)

            # instruction sheet cost calculation
            self.instruction_sheet_cost = self._instruction_sheet_cost(db)

            # pallet cost calculation
            self.pallet_count = pallet_count or self.blank_forms_per_standee
            self.pallet_material_cost = db.get_unit_cost(PALLET) * self.pallet_count
            self.pallet_labor_cost = db.get_unit_cost(PALLET_LABOR) * self.pallet_count
            self.pallet_cost = self.pallet_material_cost + self.pallet_labor_cost
            # freight cost calculation
            self.freight_cost = freight_cost or db.get_unit_cost(EXTERNAL_MOUNT_ASSEMBLY)

            # die cost calculation
            self.die_cost = die_cost or self._die_cost(db)

        return self.total_cost

    @property
    def total_cost(self) -> float:
        """Calculate the total cost of the project, including both universal and scenario-specific costs."""
        return (
            self.total_universal_cost
            + self.corrugate_cost
            + self.print_form_cost
            + self.print_cost
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
        num_overs: int = 0,
        corrugate_supplier: str = PQ,
        corrugate_material: str = B_WHITE,
        imposition_hours: float = 0,
        blank_comp_count: float = 0,
        color_comp_count: float = 0,
        freight_cost: float = 0,
        die_cost: float = 0,
        **kwargs,
    ) -> float:
        super()._calculate_universal_costs(
            num_standees=num_standees,
            print_forms_per_standee=print_forms_per_standee,
            structure_forms_per_standee=structure_forms_per_standee,
            num_overs=num_overs,
            imposition_hours=imposition_hours,
            blank_comp_count=blank_comp_count,
            color_comp_count=color_comp_count,
        )
        with MidnightOilDB() as db:
            # corrugate cost calculation
            self.corrugate_supplier = corrugate_supplier
            self.corrugate_material = corrugate_material
            self.corrugate_cost = self._get_supplier_cost(
                db, self.corrugate_supplier, self.corrugate_material, self.num_standees * self.blank_forms_per_standee
            )

            # print form cost calculation
            self.overs = db.get_overs(self.num_standees)
            self.print_form_cost = self._get_supplier_cost(
                db,
                FOSTERS,
                FOSTERS_PRINT_FORM,
                self.num_standees * self.print_forms_per_standee + self.overs,
            )

            # shipping box and label cost calculation
            _, self.label_cost = self._shipping_box_and_label_cost(db)

            # instruction sheet cost calculation
            self.instruction_sheet_cost = self._instruction_sheet_cost(db)

            # freight cost calculation
            self.freight_cost = freight_cost or db.get_unit_cost(FULL_OUT_SOURCE)

            # die cost calculation
            self.die_cost = die_cost or self._die_cost(db)

        return self.total_cost

    @property
    def total_cost(self) -> float:
        """Calculate the total cost of the project, including both universal and scenario-specific costs."""
        return (
            self.total_universal_cost
            + self.corrugate_cost
            + self.print_form_cost
            + self.label_cost
            + self.instruction_sheet_cost
            + self.freight_cost
            + self.die_cost
        )
