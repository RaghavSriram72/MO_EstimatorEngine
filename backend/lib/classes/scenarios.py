from typing import override

from lib.classes import (
    Project,
    Scenario1Input,
    Scenario2Input,
    Scenario3Input,
    Scenario4Input,
    Scenario5Input,
)
from lib.classes.db_keys import SupplierKey, UnitCostKey


class Scenario1[T: Scenario1Input](Project[T]):
    """Scenario 1: Internal Print, Internal Finishing, Packed out."""

    @override
    def calculate_cost(self, input: T) -> float:
        super().calculate_cost(input)
        # print form cost calculation
        self.corrugate_cost = self._get_corrugate_cost()

        self.print_form_cost = self._print_form_cost(UnitCostKey.ROLL_BUSMARK)
        print_linear_inches = self._get_print_form_linear_inches()
        self.print_hours = input.print_hours or self._machine_time(UnitCostKey.RHO_512R, print_linear_inches)
        self.print_cost = self._machine_cost(UnitCostKey.RHO_512R, self.print_hours)
        self.rollx_hours = input.rollx_hours or self._machine_time(UnitCostKey.ROLLX, print_linear_inches)
        self.rollx_cost = self._machine_cost(UnitCostKey.ROLLX, self.rollx_hours)
        # linear inches for zund is linear inches for all print forms plus one blank form per print form per standee
        self.zund_hours = input.zund_hours or self._zund_hours()
        self.zund_cut_cost = self._machine_cost(UnitCostKey.ZUND_CUTTER, self.zund_hours)

        # shipping box and label cost calculation
        self.shipping_box_cost, self.label_cost = self._shipping_box_and_label_cost()

        # instruction sheet cost calculation
        self.instruction_sheet_cost = self._instruction_sheet_cost()

        # kitting and assembly cost calculation
        self.kitting_and_assembly_cost = self._kitting_and_assembly_cost()

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
            + self.kitting_and_assembly_cost
        )


class Scenario2[T: Scenario2Input](Project[T]):
    """Scenario 2: Internal Print, Internal Finishing, Assembled."""

    @override
    def calculate_cost(self, input: T) -> float:
        super().calculate_cost(input)
        self.corrugate_cost = self._get_corrugate_cost()

        # print form cost calculation
        self.print_form_cost = self._print_form_cost(UnitCostKey.ROLL_BUSMARK)
        print_linear_inches = self._get_print_form_linear_inches()
        self.print_hours = input.print_hours or self._machine_time(UnitCostKey.RHO_512R, print_linear_inches)
        self.print_cost = self._machine_cost(UnitCostKey.RHO_512R, self.print_hours)
        self.rollx_hours = input.rollx_hours or self._machine_time(UnitCostKey.ROLLX, print_linear_inches)
        self.rollx_cost = self._machine_cost(UnitCostKey.ROLLX, self.rollx_hours)

        # zund cost calculation
        self.zund_hours = input.zund_hours or self._zund_hours()
        self.zund_cut_cost = self._machine_cost(UnitCostKey.ZUND_CUTTER, self.zund_hours)

        # shipping box and label cost calculation
        self.shipping_box_cost, self.label_cost = self._shipping_box_and_label_cost()

        # kitting and assembly cost calculation
        self.kitting_and_assembly_cost = self._kitting_and_assembly_cost()

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
            + self.kitting_and_assembly_cost
        )


class Scenario3[T: Scenario3Input](Project[T]):
    """Scenario 3: Internal Print, Internal Finishing, External Assembly."""

    @override
    def calculate_cost(self, input: T) -> float:
        super().calculate_cost(input)
        self.corrugate_cost = self._get_corrugate_cost()

        # print form cost calculation
        self.print_form_cost = self._print_form_cost(UnitCostKey.ROLL_BUSMARK)
        print_linear_inches = self._get_print_form_linear_inches()
        self.print_hours = input.print_hours or self._machine_time(UnitCostKey.RHO_512R, print_linear_inches)
        self.print_cost = self._machine_cost(UnitCostKey.RHO_512R, self.print_hours)
        self.rollx_hours = input.rollx_hours or self._machine_time(UnitCostKey.ROLLX, print_linear_inches)
        self.rollx_cost = self._machine_cost(UnitCostKey.ROLLX, self.rollx_hours)

        # zund cost calculation
        self.zund_hours = input.zund_hours or self._zund_hours()
        self.zund_cut_cost = self._machine_cost(UnitCostKey.ZUND_CUTTER, self.zund_hours)

        # shipping box and label cost calculation
        self.shipping_box_cost, self.label_cost = self._shipping_box_and_label_cost()

        # instruction sheet cost calculation
        self.instruction_sheet_cost = self._instruction_sheet_cost()

        # pallet cost calculation
        self.pallet_count = input.pallet_count or self.print_forms_per_standee
        self.pallet_material_cost = self.db.get_unit_cost(UnitCostKey.PALLET) * self.pallet_count
        self.pallet_labor_cost = self.db.get_unit_cost(UnitCostKey.PALLET_LABOR) * self.pallet_count
        self.pallet_cost = self.pallet_material_cost + self.pallet_labor_cost
        # freight cost calculation
        self.freight_cost = input.freight_cost or self.db.get_unit_cost(UnitCostKey.EXTERNAL_ASSEMBLY)
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


class Scenario4[T: Scenario4Input](Project[T]):
    """Scenario 4: Internal Print, External Mount & Die Cut, External Assembly."""

    @override
    def calculate_cost(self, input: T) -> float:
        super().calculate_cost(input)
        # corrugate cost calculation
        self.corrugate_supplier = input.corrugate_supplier
        self.corrugate_material = input.corrugate_material
        self.corrugate_cost = self._get_supplier_cost(
            self.corrugate_supplier, self.corrugate_material, self._get_net_corrugate_forms()
        )

        # print form cost calculation
        self.print_form_cost = self._print_form_cost(UnitCostKey.SHEET_95)
        print_linear_inches = self._get_print_form_linear_inches()
        self.print_hours = input.print_hours or self._machine_time(UnitCostKey.RHO_1312, print_linear_inches)
        self.print_cost = self._machine_cost(UnitCostKey.RHO_1312, self.print_hours)

        # shipping box and label cost calculation
        self.shipping_box_cost, self.label_cost = self._shipping_box_and_label_cost()

        # instruction sheet cost calculation
        self.instruction_sheet_cost = self._instruction_sheet_cost()

        # pallet cost calculation
        self.pallet_count = input.pallet_count or self.blank_forms_per_standee
        self.pallet_material_cost = self.db.get_unit_cost(UnitCostKey.PALLET) * self.pallet_count
        self.pallet_labor_cost = self.db.get_unit_cost(UnitCostKey.PALLET_LABOR) * self.pallet_count
        self.pallet_cost = self.pallet_material_cost + self.pallet_labor_cost
        # freight cost calculation
        self.freight_cost = input.freight_cost or self.db.get_unit_cost(UnitCostKey.EXTERNAL_MOUNT_ASSEMBLY)

        # die cost calculation
        self.die_cost = input.die_cost or self._die_cost()

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


class Scenario5[T: Scenario5Input](Project[T]):
    """Scenario 5: External Print, External Finishing, Packed out."""

    @override
    def calculate_cost(self, input: T) -> float:
        super().calculate_cost(input)
        # corrugate cost calculation
        self.corrugate_supplier = input.corrugate_supplier
        self.corrugate_material = input.corrugate_material
        self.corrugate_cost = self._get_supplier_cost(
            self.corrugate_supplier, self.corrugate_material, self._get_net_corrugate_forms()
        )

        # print form cost calculation
        self.print_form_cost = self._get_supplier_cost(
            SupplierKey.FOSTERS,
            SupplierKey.FOSTERS_PRINT_FORM,
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
