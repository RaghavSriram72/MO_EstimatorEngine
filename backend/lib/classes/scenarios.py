from typing import override

from lib.classes.cost_inputs import (
    Scenario1Input,
    # Scenario2Input,  # Scenario 2 disabled — no longer offered as a quote scenario.
    Scenario3Input,
    Scenario4Input,
    Scenario5Input,
)
from lib.classes.db_keys import UnitCostEntries
from lib.classes.project import InHouseProject, OutsourceProject

FOSTERS_DEFAULT_OVERS = 100


class Scenario1[T: Scenario1Input](InHouseProject[T]):
    """Scenario 1: Internal Print, Internal Finishing, Packed out."""

    @override
    def calculate_cost(self, input: T) -> None:
        super().calculate_cost(input)
        self.instruction_sheet_cost = self._get_instruction_sheet_cost()
        self.kitting_and_assembly_cost = self._get_kitting_and_assembly_cost()

    @property
    def total_cost(self) -> float:
        """Calculate the total cost of the project, including both universal and scenario-specific costs."""
        return super().total_cost + self.instruction_sheet_cost + self.kitting_and_assembly_cost


# Scenario 2 disabled — no longer offered as a quote scenario. Tabs now go 1, 3, 4, 5.
# class Scenario2[T: Scenario2Input](InHouseProject[T]):
#     """Scenario 2: Internal Print, Internal Finishing, Assembled."""
#
#     @override
#     def calculate_cost(self, input: T) -> None:
#         super().calculate_cost(input)
#         self.instruction_sheet_cost = self._get_instruction_sheet_cost()
#         self.kitting_and_assembly_cost = self._get_kitting_and_assembly_cost()
#
#     @property
#     def total_cost(self) -> float:
#         """Calculate the total cost of the project, including both universal and scenario-specific costs."""
#         return super().total_cost + self.instruction_sheet_cost + self.kitting_and_assembly_cost


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
        self.freight_cost = input.freight_cost or self.db.get_unit_cost(UnitCostEntries.EXTERNAL_ASSEMBLY)
        self.packout = (
            self.db.get_packout(self.num_standees, self.standee_key.split()[0])
            * self.num_standees
        )

    @property
    def total_cost(self) -> float:
        """Calculate the total cost of the project, including both universal and scenario-specific costs."""
        return super().total_cost + self.instruction_sheet_cost + self.pallet_cost + self.freight_cost + self.packout


class Scenario4[T: Scenario4Input](OutsourceProject[T]):
    """Scenario 4: Internal Print, External Mount & Die Cut, External Assembly."""

    @override
    def calculate_cost(self, input: T) -> None:
        super().calculate_cost(input)
        self.imposition_hours = input.imposition_hours or self.print_forms_per_standee
        imposition_rate = self.db.get_unit_cost(UnitCostEntries.IMPOSITION_LABOR)
        self.imposition_cost = imposition_rate * self.imposition_hours
        self.print_form_cost = self._get_print_form_cost(UnitCostEntries.SHEET_95)
        self.print_material = UnitCostEntries.SHEET_95
        print_linear_inches = self._get_print_form_linear_inches()
        self.print_hours = input.print_hours or self._get_machine_time(UnitCostEntries.RHO_1312, print_linear_inches)
        self.print_cost = self._get_machine_cost(UnitCostEntries.RHO_1312, self.print_hours)
        # Pallets only carry printed forms, not blank/structure forms.
        self.pallet_count = input.pallet_count or self.print_forms_per_standee
        self.pallet_material_cost = self.db.get_unit_cost(UnitCostEntries.PALLET) * self.pallet_count
        self.pallet_labor_cost = self.db.get_unit_cost(UnitCostEntries.PALLET_LABOR) * self.pallet_count
        self.pallet_cost = self.pallet_material_cost + self.pallet_labor_cost
        self.freight_cost = input.freight_cost or self.db.get_unit_cost(UnitCostEntries.EXTERNAL_MOUNT_ASSEMBLY)
        self.die_cost = input.die_cost or self._get_die_cost()
        self.packout = (
            self.db.get_packout(self.num_standees, self.standee_key.split()[0])
            * self.num_standees
        )

    @property
    def total_cost(self) -> float:
        """Calculate the total cost of the project, including both universal and scenario-specific costs."""
        return (
            super().total_cost
            + self.imposition_cost
            + self.print_form_cost
            + self.print_cost
            + self.pallet_cost
            + self.freight_cost
            + self.packout
        )


class Scenario5[T: Scenario5Input](OutsourceProject[T]):
    """Scenario 5: External Print, External Finishing, Packed out."""

    @override
    def calculate_cost(self, input: T) -> None:
        input.num_overs = FOSTERS_DEFAULT_OVERS
        super().calculate_cost(input)
        self.imposition_hours = input.imposition_hours or self.print_forms_per_standee
        imposition_rate = self.db.get_unit_cost(UnitCostEntries.IMPOSITION_LABOR)
        self.imposition_cost = imposition_rate * self.imposition_hours
        # sets material, supplier, and print_form_unit_cost (needs to change)
        self.litho_buyout_cost = self._get_supplier_litho_buyout_cost()
        # Pallets only carry printed forms, not blank/structure forms.
        self.pallet_count = input.pallet_count or self.print_forms_per_standee
        self.pallet_material_cost = self.db.get_unit_cost(UnitCostEntries.PALLET) * self.pallet_count
        self.pallet_labor_cost = self.db.get_unit_cost(UnitCostEntries.PALLET_LABOR) * self.pallet_count
        self.pallet_cost = self.pallet_material_cost + self.pallet_labor_cost
        self.freight_cost = input.freight_cost or self.db.get_unit_cost(UnitCostEntries.FULL_OUT_SOURCE)
        self.die_cost = input.die_cost or self._get_die_cost()
        self.packout = (
            self.db.get_packout(self.num_standees, self.standee_key.split()[0])
            * self.num_standees
        )

    @property
    def total_cost(self) -> float:
        """Calculate the total cost of the project, including both universal and scenario-specific costs."""
        return (
            super().total_cost
            + self.imposition_cost
            + self.litho_buyout_cost
            + self.pallet_cost
            + self.freight_cost
            + self.packout
        )
