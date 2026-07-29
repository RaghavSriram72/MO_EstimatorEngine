import math
from dataclasses import dataclass
from enum import Enum
from typing import override

from lib.classes import Complexity, Form, MidnightOilDB
from lib.classes.cost_inputs import BaseInput, InHouseInput, OutsourceInput
from lib.classes.db_keys import StandeeKey, SupplierMaterials, Suppliers, UnitCostEntries
from lib.globals import BUSMARK_PADDING, BUSMARK_PRINT_FORM_LENGTH, BUSMARK_ROLL_LENGTH, PRINT_95_FORM_LENGTH, UNIT_MAP

STANDEE_MAP = {
    Complexity.SIMPLE: StandeeKey.SIMPLE,
    Complexity.MODERATE: StandeeKey.MODERATE,
    Complexity.COMPLEX: StandeeKey.COMPLEX,
}


@dataclass
class Project[T: BaseInput]:
    """Class to represent a overall standee project."""

    db: MidnightOilDB
    name: str
    print_forms: list[Form]
    num_standees: int
    standee_type: Complexity

    def __post_init__(self):
        self.standee_key = STANDEE_MAP[self.standee_type]

    @property
    def total_universal_cost(self) -> float:
        """Calculate the total universal cost for the project."""
        return self.blank_comp_cost + self.color_comp_cost + self.engineering_design_cost + self.hardware_cost

    @property
    def total_cost(self) -> float:
        """Calculate the total cost of the project, including both universal and scenario-specific costs."""
        raise NotImplementedError("Subclasses must implement total_cost property")

    def to_dict(self) -> dict:
        """Return common project/scenario fields as a dictionary."""
        return {k: v for k, v in self.__dict__.items() if not k.startswith("_") and k != "db"}

    def to_serializable_dict(self) -> dict:
        """Subset of ``to_dict`` safe for JSON/BSON: no ``print_forms``/``Form``, enums as ints."""
        out: dict = {}
        for k, v in self.__dict__.items():
            if k.startswith("_") or k in ("db", "print_forms"):
                continue
            if isinstance(v, Enum):
                out[k] = v.value
            else:
                out[k] = v
        return out

    def calculate_cost(self, input: T) -> None:
        """Calculate the total cost of the project, including both universal and scenario-specific costs."""
        db = self.db
        self.num_standees = input.num_standees or self.num_standees
        # corrugate cost calculation
        self.print_forms_per_standee = input.print_forms_per_standee or len(self.print_forms)
        self.structure_forms_per_standee = input.structure_forms_per_standee or self._get_structure_forms_per_standee()
        self.blank_forms_per_standee = self.print_forms_per_standee + self.structure_forms_per_standee

        # hardware cost calculation
        self.hardware_cost = db.get_standee_data(self.standee_key, "hardware_cost") * self.num_standees

        # misc costs and project vars
        self.overs = db.get_overs(self.num_standees) if input.num_overs is None else input.num_overs
        self.print_form_total = self._get_net_print_forms()
        self.engineering_design_cost = db.get_standee_data(self.standee_key, "engineering_design_cost_per_project")
        self.blank_comp_count = input.blank_comp_count or 1
        self.blank_comp_cost = db.get_unit_cost(UnitCostEntries.BLANK_COMP) * self.blank_comp_count
        self.color_comp_count = input.color_comp_count or 1
        self.color_comp_cost = db.get_unit_cost(UnitCostEntries.COLOR_COMP) * self.color_comp_count

    # Helpers
    def _get_structure_forms_per_standee(self) -> float:
        try:
            return self.db.get_structure_forms_per_standee(self.print_forms_per_standee)
        except ValueError:
            return self.print_forms_per_standee * 1.5  # default to 50% more structure forms

    def _get_print_form_cost(self, print_material_name: str) -> float:
        print_form_material = self.db.get_unit_cost_entry(print_material_name)
        print_form_unit = print_form_material["unit"]  # linear_foot
        linear_inches = 0
        print_form_cost = 0
        if print_form_unit != "linear_foot":
            print_form_cost = print_form_material["cost"] * UNIT_MAP[print_form_unit] * self.print_form_total
        elif print_form_unit == "linear_foot":
            linear_inches = self._get_print_form_linear_inches()
        else:
            raise ValueError(f"Unsupported unit type '{print_form_unit}' for print material '{print_material_name}'")

        if "roll" in print_material_name:
            print_form_cost = print_form_material["cost"] * UNIT_MAP[print_form_unit] * linear_inches

        # ! do we need hi-tack if theyre doing mounting??
        # add hi-tack if not busmark
        else:
            hi_tack_material = self.db.get_unit_cost_entry(UnitCostEntries.ROLL_HI_TACK)
            hi_tack_unit = hi_tack_material["unit"]
            hi_tack_cost = hi_tack_material["cost"] * UNIT_MAP[hi_tack_unit] * linear_inches
            print_form_cost += hi_tack_cost
        return print_form_cost

    def _get_print_form_linear_inches(self) -> float:
        return PRINT_95_FORM_LENGTH * self.print_form_total

    def _setup_time(self, unit_cost_entry: dict, forms: int) -> float:
        return unit_cost_entry["setup_time"] * forms

    def _get_machine_time(self, machine_name: str, linear_inches: float) -> float:
        machine_entry = self.db.get_unit_cost_entry(machine_name)
        throughput: int = machine_entry["throughput"]
        throughput_unit: str = machine_entry["throughput_unit"]
        print(machine_name, throughput, throughput_unit, linear_inches)
        machine_time: float = linear_inches / (throughput / UNIT_MAP[throughput_unit]) + self._setup_time(
            machine_entry, self.print_forms_per_standee
        )
        return machine_time

    def _get_machine_cost(self, machine_name: str, machine_hours: float) -> float:
        machine_entry = self.db.get_unit_cost_entry(machine_name)
        machine_cost = machine_entry["cost"] * UNIT_MAP[machine_entry["unit"]] * machine_hours
        return machine_cost

    def _get_zund_print_minutes_per_form(self) -> float:
        """Minutes per form using project-level standee complexity (fallback for extra/manual forms)."""
        return self.db.get_standee_data(self.standee_key, "zund_print_form_minutes")

    def _get_zund_hours(self) -> float:
        # Per-form decision: a form only uses its own real linear inches when every element
        # on it has them provided. A form mixing provided/un-provided elements (or with none
        # at all) falls back to the static per-form minutes for its own (max) complexity.
        linear_forms = [form for form in self.print_forms if self._form_uses_linear_inches(form)]
        static_forms = [form for form in self.print_forms if not self._form_uses_linear_inches(form)]

        zund_linear_inches = sum(form.get_linear_inches() for form in linear_forms)
        linear_print_zund_hours = (
            self._get_machine_time(UnitCostEntries.ZUND_CUTTER, zund_linear_inches) if linear_forms else 0.0
        )

        # Per-form complexity for bin-packed static forms; extra manual forms use project standee complexity.
        packed_minutes = sum(
            self.db.get_standee_data(STANDEE_MAP[form.complexity], "zund_print_form_minutes") for form in static_forms
        )
        extra_forms = max(0, self.print_forms_per_standee - len(self.print_forms))
        extra_minutes = extra_forms * self._get_zund_print_minutes_per_form()
        static_print_zund_hours = (packed_minutes + extra_minutes) * self.num_standees / 60

        print_zund_hours = linear_print_zund_hours + static_print_zund_hours

        structure_zund_hours = (
            self.db.get_standee_data(self.standee_key, "zund_blank_form_minutes")
            * self.structure_forms_per_standee
            * self.num_standees
        ) / 60

        return (
            print_zund_hours
            + structure_zund_hours
            + self._setup_time(
                self.db.get_unit_cost_entry(UnitCostEntries.ZUND_CUTTER), round(self.blank_forms_per_standee)
            )
        )

    def _get_shipping_box_and_label_cost(self) -> tuple[float, float]:
        shipping_box_cost = self.db.get_unit_cost(UnitCostEntries.SHIPPING_BOX) * self.num_standees
        desc_label_cost = self.db.get_unit_cost(UnitCostEntries.DESCRIPTION_LABEL)
        shipping_label_cost = self.db.get_unit_cost(UnitCostEntries.SHIPPING_LABEL)
        label_cost = (2 * desc_label_cost + shipping_label_cost) * self.num_standees
        return shipping_box_cost, label_cost

    def _get_instruction_sheet_cost(self) -> float:
        instruction_sheet_cost = (
            self.db.get_standee_data(self.standee_key, "instruction_sheet_total_cost") * self.num_standees
        )
        return instruction_sheet_cost

    def _all_elements_have_linear_inches(self) -> bool:
        """True only if every element across every print form has explicit linear inches."""
        elements = [element for form in self.print_forms for element in form.elements]
        return bool(elements) and all(element.linear_inches_provided for element in elements)

    def _form_uses_linear_inches(self, form: Form) -> bool:
        """Per-form decision for Zund cutting.

        A form uses its own real linear-inches data only if every element placed on it has
        linear inches provided. A form that mixes provided and un-provided elements (or has
        none at all) falls back to the static per-form cost, keyed off the form's own
        complexity — already the max complexity among its elements, set during bin packing
        in ``print_form_calculator``.
        """
        return bool(form.elements) and all(element.linear_inches_provided for element in form.elements)

    def _get_die_cost(self) -> float:
        die_unit_cost = self.db.get_unit_cost(UnitCostEntries.DIE_COST)

        # Blank/structure forms carry no linear-inch data, so they always use the static
        # per-standee die cost.
        blank_die_cost = self.structure_forms_per_standee * self.db.get_standee_data(
            self.standee_key, "cutting_die_blank_form_min"
        )

        if self._all_elements_have_linear_inches():
            # Every element has real linear inches: scale them by the complexity multiplier.
            die_complexity_map = {
                complexity: self.db.get_standee_data(term, "cutting_die_inches_multiplier")
                for complexity, term in STANDEE_MAP.items()
            }
            print_die_cost = sum(
                element.get_linear_inches() * die_complexity_map[element.complexity] * die_unit_cost
                for form in self.print_forms
                for element in form.elements
            )
        else:
            # Missing linear inches for at least one element: fall back to the static
            # per-standee print-form die cost.
            print_die_cost = sum(
                self.db.get_standee_data(STANDEE_MAP[form.complexity], "cutting_die_print_form_min")
                for form in self.print_forms
            )

        return blank_die_cost + print_die_cost

    def _get_kitting_and_assembly_cost(self) -> float:
        return self.db.get_standee_data(self.standee_key, "kitting_and_assembly") * self.num_standees

    def _get_supplier_cost(self, supplier: str, material: str, num_forms: float, material_type: str = "") -> float:
        record = self.db.get_supplier_material_records(supplier, material, material_type)
        unit = record["unit"]

        # Exact price-break lookup — keyed by num_standees (job qty), not derived forms
        for pb in record.get("price_breaks", []):
            if pb.get("amount") is not None and abs(pb["amount"] - self.num_standees) < 1e-9:
                return pb["cost"] * UNIT_MAP[unit]

        # Fall back to fitted curve
        params = self.db.get_curve_params(supplier, material, material_type)
        if params is None:
            raise ValueError(
                f"No pricing data found for supplier={supplier!r} material={material!r} type={material_type!r}"
            )
        cost_per_unit = params["a"] * num_forms ** params["b"] + params["c"]
        return cost_per_unit * UNIT_MAP[unit]

    def _get_supplier_litho_buyout_cost(
        self,
        supplier: str = Suppliers.FOSTERS,
        material: str = SupplierMaterials.FOSTERS_PRINT_FORM,
    ) -> float:
        sheets_per_form = self.num_standees + self.overs # for every form I need one sheet per standee plus one per over
        unit_cost = self._get_supplier_cost(supplier, material, sheets_per_form)
        self.litho_sheets_per_form = sheets_per_form
        self.supplier = supplier
        self.material = material
        self.litho_buyout_unit_cost = unit_cost
        return unit_cost * sheets_per_form * self.print_forms_per_standee

    def _get_supplier_mount_die_buyout_cost(
        self, supplier: str, material: str, forms: float, material_type: str = ""
    ) -> tuple[float, float]:
        """Returns ``(unit_cost, total_cost)``.

        This helper is reused for several unrelated buyout lines (mount/die print forms,
        mount/die blank forms, shipping box), each with
        its own supplier-curve unit price, so the caller must capture and label the unit cost
        itself rather than relying on a shared instance attribute (that was the bug: whichever
        call ran last silently clobbered a single ``mount_die_buyout_unit_cost`` field).
        """
        unit_cost = self._get_supplier_cost(supplier, material, self.num_standees, material_type)
        return unit_cost, unit_cost * self.num_standees * forms

    def _get_base_corrugate_forms(self) -> float:
        return self.blank_forms_per_standee * self.num_standees

    def _get_net_corrugate_forms(self) -> float:
        return self._get_base_corrugate_forms() + self.print_forms_per_standee * self.overs

    def _get_corrugate_cost(self) -> float:
        corrugate_cost = self.db.get_unit_cost(UnitCostEntries.CORRUGATE)
        return self._get_net_corrugate_forms() * corrugate_cost

    def _get_base_print_forms(self) -> float:
        return self.print_forms_per_standee * self.num_standees

    def _get_net_print_forms(self) -> float:
        return self._get_base_print_forms() + self.overs * self.print_forms_per_standee


class InHouseProject[T: InHouseInput](Project[T]):
    """Base class for in-house production scenarios."""

    corrugate_cost: float
    print_form_cost: float
    imposition_cost: float
    zund_cost: float
    print_cost: float
    rollx_cost: float
    shipping_box_cost: float
    label_cost: float

    @property
    def total_cost(self) -> float:
        """Calculate the total cost of the project, including both universal and scenario-specific costs."""
        return (
            self.total_universal_cost
            + self.corrugate_cost
            + self.print_form_cost
            + self.imposition_cost
            + self.zund_cost
            + self.print_cost
            + self.rollx_cost
            + self.shipping_box_cost
            + self.label_cost
        )

    def _get_print_form_linear_inches(self) -> float:
        forms_per_roll = math.floor((BUSMARK_ROLL_LENGTH - BUSMARK_PADDING) / BUSMARK_PRINT_FORM_LENGTH)
        self.busmark_web_ups = math.ceil(self.print_form_total / forms_per_roll) if forms_per_roll > 0 else 1
        return BUSMARK_PRINT_FORM_LENGTH * self.print_form_total + BUSMARK_PADDING * self.busmark_web_ups

    @override
    def _get_zund_hours(self) -> float:
        # Per-form decision: a form only uses its own real linear inches when every element
        # on it has them provided. A form mixing provided/un-provided elements (or with none
        # at all) falls back to the static per-form minutes for its own (max) complexity.
        linear_forms = [form for form in self.print_forms if self._form_uses_linear_inches(form)]
        static_forms = [form for form in self.print_forms if not self._form_uses_linear_inches(form)]

        zund_linear_inches = sum(form.get_linear_inches() for form in linear_forms)
        linear_print_zund_hours = (
            self._get_machine_time(UnitCostEntries.ZUND_CUTTER, zund_linear_inches) if linear_forms else 0.0
        )

        # Per-form complexity for bin-packed static forms; extra manual forms use project standee complexity.
        packed_minutes = sum(
            self.db.get_standee_data(STANDEE_MAP[form.complexity], "zund_print_form_minutes") for form in static_forms
        )
        extra_forms = max(0, self.print_forms_per_standee - len(self.print_forms))
        extra_minutes = extra_forms * self._get_zund_print_minutes_per_form()
        static_print_zund_hours = (packed_minutes + extra_minutes) * self.num_standees / 60

        print_zund_hours = linear_print_zund_hours + static_print_zund_hours

        structure_zund_hours = (
            self.db.get_standee_data(self.standee_key, "zund_blank_form_minutes")
            * self.structure_forms_per_standee
            * self.num_standees
        ) / 60
        return (
            print_zund_hours
            + structure_zund_hours
            + self._setup_time(
                self.db.get_unit_cost_entry(UnitCostEntries.ZUND_CUTTER), round(self.blank_forms_per_standee)
            )
        )

    @override
    def calculate_cost(self, input: T) -> None:
        super().calculate_cost(input)
        self.corrugate_cost = self._get_corrugate_cost()
        self.print_form_cost = self._get_print_form_cost(UnitCostEntries.ROLL_BUSMARK)
        self.print_material = UnitCostEntries.ROLL_BUSMARK

        self.imposition_hours = input.imposition_hours or self.print_forms_per_standee
        imposition_rate = self.db.get_unit_cost(UnitCostEntries.IMPOSITION_LABOR)
        self.imposition_cost = imposition_rate * self.imposition_hours

        self.zund_hours = input.zund_hours or self._get_zund_hours()
        self.zund_cost = self._get_machine_cost(UnitCostEntries.ZUND_CUTTER, self.zund_hours)
        self.zund_cut_cost = self.zund_cost

        self.print_hours = input.print_hours or (
            self._get_machine_time(input.print_machine, self._get_print_form_linear_inches())
        )
        self.print_cost = self._get_machine_cost(input.print_machine, self.print_hours)
        self.print_machine = input.print_machine

        self.rollx_hours = input.rollx_hours or (
            self._get_machine_time(UnitCostEntries.ROLLX, BUSMARK_PRINT_FORM_LENGTH * self.print_form_total)
        )
        self.rollx_cost = self._get_machine_cost(UnitCostEntries.ROLLX, self.rollx_hours)

        self.shipping_box_cost, self.label_cost = self._get_shipping_box_and_label_cost()


class OutsourceProject[T: OutsourceInput](Project[T]):
    """Base class for outsourced production scenarios."""

    corrugate_cost: float
    print_form_cost: float
    mount_die_buyout_cost: float
    die_cost: float
    shipping_box_cost: float
    label_cost: float
    instruction_sheet_cost: float

    @property
    def total_cost(self) -> float:
        """Calculate the total cost of the project, including both universal and scenario-specific costs."""
        return (
            self.total_universal_cost
            + self.corrugate_cost
            + self.print_form_cost
            + self.mount_die_buyout_cost
            + self.die_cost
            + self.shipping_box_cost
            + self.label_cost
            + self.instruction_sheet_cost
        )

    @override
    def calculate_cost(self, input: T) -> None:
        super().calculate_cost(input)
        self.corrugate_supplier = input.corrugate_supplier
        self.corrugate_material = input.corrugate_material
        is_pq = input.corrugate_supplier == Suppliers.PQ
        _, print_buyout = self._get_supplier_mount_die_buyout_cost(
            input.corrugate_supplier, input.corrugate_material, self.print_forms_per_standee,
            "print" if is_pq else "",
        )
        _, blank_buyout = self._get_supplier_mount_die_buyout_cost(
            input.corrugate_supplier, input.corrugate_material, self.structure_forms_per_standee,
            "blank" if is_pq else "",
        )
        self.mount_die_buyout_cost = print_buyout + blank_buyout
        # Blended per-standee unit cost so qty (num_standees) × unit_cost reconstructs the
        # total in the UI — the print/blank legs use different supplier-curve unit prices,
        # so neither one alone is representative of the combined line.
        self.mount_die_buyout_unit_cost = (
            self.mount_die_buyout_cost / self.num_standees if self.num_standees else 0.0
        )
        self.die_cost = self._get_die_cost()
        self.shipping_box_unit_cost, self.shipping_box_cost = self._get_supplier_mount_die_buyout_cost(
            input.corrugate_supplier, SupplierMaterials.BLANK, 1, "blank" if is_pq else ""
        )
        _, self.label_cost = self._get_shipping_box_and_label_cost()
        self.instruction_sheet_cost = self._get_instruction_sheet_cost()
