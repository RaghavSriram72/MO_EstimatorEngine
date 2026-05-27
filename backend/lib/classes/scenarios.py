from typing import override

from lib.classes.cost_inputs import (
    Scenario1Input,
    Scenario2Input,
    Scenario3Input,
    Scenario4Input,
    Scenario5Input,
)
from lib.classes.db_keys import SupplierMaterials, Suppliers, UnitCostEntries
from lib.classes.project import InHouseProject, OutsourceProject

FOSTERS_DEFAULT_OVERS = 100


class Scenario1[T: Scenario1Input](InHouseProject[T]):
    """Scenario 1: Internal Print, Internal Finishing, Packed out."""

    @override
    def calculate_cost(self, input: T) -> None:
        super().calculate_cost(input)
        self.instruction_sheet_cost = self._get_instruction_sheet_cost()

    @property
    def total_cost(self) -> float:
        """Calculate the total cost of the project, including both universal and scenario-specific costs."""
        return super().total_cost + self.instruction_sheet_cost


class Scenario2[T: Scenario2Input](InHouseProject[T]):
    """Scenario 2: Internal Print, Internal Finishing, Assembled."""

    pass


class Scenario3[T: Scenario3Input](InHouseProject[T]):
    """Scenario 3: Internal Print, Internal Finishing, External Assembly."""

    @override
    def calculate_cost(self, input: T) -> None:
        super().calculate_cost(input)
        self.instruction_sheet_cost = self._get_instruction_sheet_cost()
        self.pallet_count = input.pallet_count or self.print_forms_per_standee
        self.pallet_material_cost = self.db.get_unit_cost(UnitCostEntries.PALLET) * self.pallet_count
        self.pallet_labor_cost = self.db.get_unit_cost(UnitCostEntries.PALLET_LABOR) * self.pallet_count
        self.pallet_cost = self.pallet_material_cost + self.pallet_labor_cost
        # freight cost calculation
        self.freight_cost = input.freight_cost or self.db.get_unit_cost(EXTERNAL_ASSEMBLY)
        self.packout = self.db.get_packout(self.num_standees, self.print_forms_per_standee, self.standee_key.split()[0]) * self.num_standees
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
            + self.packout
        )


class Scenario4[T: Scenario4Input](OutsourceProject[T]):
    """Scenario 4: Internal Print, External Mount & Die Cut, External Assembly."""

    @override
    def calculate_cost(self, input: T) -> None:
        super().calculate_cost(input)
        self.imposition_hours = input.imposition_hours or self.print_forms_per_standee
        imposition_rate = self.db.get_unit_cost(UnitCostEntries.IMPOSITION_LABOR)
        self.imposition_cost = imposition_rate * self.imposition_hours
        self.print_form_cost = self._get_print_form_cost(UnitCostEntries.SHEET_95)
        print_linear_inches = self._get_print_form_linear_inches()
        self.print_hours = input.print_hours or self._get_machine_time(UnitCostEntries.RHO_1312, print_linear_inches)
        self.print_cost = self._get_machine_cost(UnitCostEntries.RHO_1312, self.print_hours)
        self.pallet_count = input.pallet_count or self.blank_forms_per_standee
        self.pallet_material_cost = self.db.get_unit_cost(UnitCostEntries.PALLET) * self.pallet_count
        self.pallet_labor_cost = self.db.get_unit_cost(UnitCostEntries.PALLET_LABOR) * self.pallet_count
        self.pallet_cost = self.pallet_material_cost + self.pallet_labor_cost
        # freight cost calculation
        self.freight_cost = input.freight_cost or self.db.get_unit_cost(UnitCostKey.EXTERNAL_MOUNT_ASSEMBLY)

        # die cost calculation
        self.die_cost = input.die_cost or self._die_cost()
        # packout cost calculation
        self.packout = self.db.get_packout(self.num_standees, self.print_forms_per_standee, self.standee_key.split()[0]) * self.num_standees

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
            + self.packout
        )


class Scenario5[T: Scenario5Input](OutsourceProject[T]):
    """Scenario 5: External Print, External Finishing, Packed out."""

    @override
    def calculate_cost(self, input: T) -> None:
        input.num_overs = FOSTERS_DEFAULT_OVERS
        super().calculate_cost(input)
        self.print_form_cost = self._get_supplier_cost(
            Suppliers.FOSTERS,
            SupplierMaterials.FOSTERS_PRINT_FORM,
            self.num_standees * self.print_forms_per_standee + self.overs,
        )

        # shipping box and label cost calculation
        _, self.label_cost = self._shipping_box_and_label_cost()

        # instruction sheet cost calculation
        self.instruction_sheet_cost = self._instruction_sheet_cost()

        # freight cost calculation
        self.freight_cost = input.freight_cost or self.db.get_unit_cost(UnitCostKey.FULL_OUT_SOURCE)

        # die cost calculation
        self.die_cost = input.die_cost or self._die_cost()

        # packout cost calculation
        self.packout = self.db.get_packout(self.num_standees, self.print_forms_per_standee, self.standee_key.split()[0]) * self.num_standees

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
            + self.packout
        )
