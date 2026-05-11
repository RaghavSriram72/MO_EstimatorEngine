from typing import override

from lib.classes import Project

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


class Scenario1(Project):
    """Scenario 1: Internal Print, Internal Finishing, Packed out."""

    @override
    def calculate_cost(
        self,
        *,
        num_standees: int = 0,
        print_forms_per_standee: int = 0,
        structure_forms_per_standee: int = 0,
        num_overs: int = 0,
        imposition_hours: float = 0,
        blank_comp_count: float = 1,
        color_comp_count: float = 1,
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
        # print form cost calculation
        self.corrugate_cost = self._get_corrugate_cost()

        self.print_form_cost = self._print_form_cost(ROLL_BUSMARK)
        print_linear_inches = self._get_print_form_linear_inches()
        self.print_hours = print_hours or self._machine_time(RHO_512R, print_linear_inches)
        self.print_cost = self._machine_cost(RHO_512R, self.print_hours)
        self.rollx_hours = rollx_hours or self._machine_time(ROLLX, print_linear_inches)
        self.rollx_cost = self._machine_cost(ROLLX, self.rollx_hours)
        self.zund_hours = zund_hours or self._zund_hours()
        self.zund_cut_cost = self._machine_cost(ZUND_CUTTER, self.zund_hours)

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


class Scenario2(Project):
    """Scenario 2: Internal Print, Internal Finishing, Assembled."""

    @override
    def calculate_cost(
        self,
        *,
        num_standees: int = 0,
        print_forms_per_standee: int = 0,
        structure_forms_per_standee: int = 0,
        num_overs: int = 0,
        imposition_hours: float = 0,
        blank_comp_count: float = 1,
        color_comp_count: float = 1,
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
        self.corrugate_cost = self._get_corrugate_cost()

        # print form cost calculation
        self.print_form_cost = self._print_form_cost(ROLL_BUSMARK)
        print_linear_inches = self._get_print_form_linear_inches()
        self.print_hours = print_hours or self._machine_time(RHO_512R, print_linear_inches)
        self.print_cost = self._machine_cost(RHO_512R, self.print_hours)
        self.rollx_hours = rollx_hours or self._machine_time(ROLLX, print_linear_inches)
        self.rollx_cost = self._machine_cost(ROLLX, self.rollx_hours)

        # zund cost calculation
        self.zund_hours = zund_hours or self._zund_hours()
        self.zund_cut_cost = self._machine_cost(ZUND_CUTTER, self.zund_hours)

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


class Scenario3(Project):
    """Scenario 3: Internal Print, Internal Finishing, External Assembly."""

    @override
    def calculate_cost(
        self,
        *,
        num_standees: int = 0,
        print_forms_per_standee: int = 0,
        structure_forms_per_standee: int = 0,
        num_overs: int = 0,
        imposition_hours: float = 0,
        blank_comp_count: float = 1,
        color_comp_count: float = 1,
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
        # corrugate cost calculation
        self.corrugate_cost = self._get_corrugate_cost()

        # print form cost calculation
        self.print_form_cost = self._print_form_cost(ROLL_BUSMARK)
        print_linear_inches = self._get_print_form_linear_inches()
        self.print_hours = print_hours or self._machine_time(RHO_512R, print_linear_inches)
        self.print_cost = self._machine_cost(RHO_512R, self.print_hours)
        self.rollx_hours = rollx_hours or self._machine_time(ROLLX, print_linear_inches)
        self.rollx_cost = self._machine_cost(ROLLX, self.rollx_hours)

        # zund cost calculation
        self.zund_hours = zund_hours or self._zund_hours()
        self.zund_cut_cost = self._machine_cost(ZUND_CUTTER, self.zund_hours)

        # shipping box and label cost calculation
        self.shipping_box_cost, self.label_cost = self._shipping_box_and_label_cost()

        # instruction sheet cost calculation
        self.instruction_sheet_cost = self._instruction_sheet_cost()

        # pallet cost calculation
        self.pallet_count = pallet_count or self.print_forms_per_standee
        self.pallet_material_cost = self.db.get_unit_cost(PALLET) * self.pallet_count
        self.pallet_labor_cost = self.db.get_unit_cost(PALLET_LABOR) * self.pallet_count
        self.pallet_cost = self.pallet_material_cost + self.pallet_labor_cost
        # freight cost calculation
        self.freight_cost = freight_cost or self.db.get_unit_cost(EXTERNAL_ASSEMBLY)
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

    @override
    def calculate_cost(
        self,
        *,
        num_standees: int = 0,
        print_forms_per_standee: int = 0,
        structure_forms_per_standee: int = 0,
        num_overs: int = 0,
        imposition_hours: float = 0,
        blank_comp_count: float = 1,
        color_comp_count: float = 1,
        print_hours: float = 0,
        corrugate_supplier: str = PQ,
        corrugate_material: str = B_WHITE,
        pallet_count: int = 0,
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
        # corrugate cost calculation
        self.corrugate_supplier = corrugate_supplier
        self.corrugate_material = corrugate_material
        self.corrugate_cost = self._get_supplier_cost(
            self.corrugate_supplier, self.corrugate_material, self._get_num_corrugate_forms()
        )

        # print form cost calculation
        self.print_form_cost = self._print_form_cost(SHEET_95)
        print_linear_inches = self._get_print_form_linear_inches()

        self.print_hours = print_hours or self._machine_time(RHO_1312, print_linear_inches)
        self.print_cost = self._machine_cost(RHO_1312, self.print_hours)

        # shipping box and label cost calculation
        self.shipping_box_cost, self.label_cost = self._shipping_box_and_label_cost()

        # instruction sheet cost calculation
        self.instruction_sheet_cost = self._instruction_sheet_cost()

        # pallet cost calculation
        self.pallet_count = pallet_count or self.blank_forms_per_standee
        self.pallet_material_cost = self.db.get_unit_cost(PALLET) * self.pallet_count
        self.pallet_labor_cost = self.db.get_unit_cost(PALLET_LABOR) * self.pallet_count
        self.pallet_cost = self.pallet_material_cost + self.pallet_labor_cost
        # freight cost calculation
        self.freight_cost = freight_cost or self.db.get_unit_cost(EXTERNAL_MOUNT_ASSEMBLY)

        # die cost calculation
        self.die_cost = die_cost or self._die_cost()

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
    """Scenario 5: External Print, External Finishing, Packed out."""

    @override
    def calculate_cost(
        self,
        *,
        num_standees: int = 0,
        print_forms_per_standee: int = 0,
        structure_forms_per_standee: int = 0,
        num_overs: int = 0,
        imposition_hours: float = 0,
        blank_comp_count: float = 1,
        color_comp_count: float = 1,
        corrugate_supplier: str = PQ,
        corrugate_material: str = B_WHITE,
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
        # corrugate cost calculation
        self.corrugate_supplier = corrugate_supplier
        self.corrugate_material = corrugate_material
        self.corrugate_cost = self._get_supplier_cost(
            self.corrugate_supplier, self.corrugate_material, self._get_num_corrugate_forms()
        )

        # print form cost calculation
        self.print_form_cost = self._get_supplier_cost(
            FOSTERS, FOSTERS_PRINT_FORM, self.num_standees * self.print_forms_per_standee + self.overs
        )

        # shipping box and label cost calculation
        _, self.label_cost = self._shipping_box_and_label_cost()

        # instruction sheet cost calculation
        self.instruction_sheet_cost = self._instruction_sheet_cost()

        # freight cost calculation
        self.freight_cost = freight_cost or self.db.get_unit_cost(FULL_OUT_SOURCE)

        # die cost calculation
        self.die_cost = die_cost or self._die_cost()

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
