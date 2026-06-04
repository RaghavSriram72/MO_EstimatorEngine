from __future__ import annotations

from dataclasses import dataclass

from lib.classes.db_keys import SupplierMaterials, Suppliers, UnitCostEntries


@dataclass
class BaseInput:  # project
    """Shared project input fields for all scenario variants."""

    num_standees: int | None = None
    print_forms_per_standee: int | None = None
    structure_forms_per_standee: int | None = None
    num_overs: int | None = None
    blank_comp_count: float | None = None
    color_comp_count: float | None = None


@dataclass
class InHouseInput(BaseInput):
    """Inputs used by in-house production scenarios."""

    imposition_hours: float | None = None
    print_machine: str = UnitCostEntries.RHO_512R
    print_hours: float | None = None
    rollx_hours: float | None = None
    zund_hours: float | None = None


@dataclass
class Scenario1Input(InHouseInput):
    """Inputs for scenario 1."""

    pass


@dataclass
class Scenario2Input(InHouseInput):
    """Inputs for scenario 2."""

    pass


@dataclass
class Scenario3Input(InHouseInput):
    """Inputs for scenario 3."""

    pallet_count: int | None = None
    freight_cost: float | None = None


@dataclass
class OutsourceInput(BaseInput):
    """Inputs used by outsourced production scenarios."""

    print_hours: float | None = None
    corrugate_supplier: str = Suppliers.PQ
    corrugate_material: str = SupplierMaterials.B_WHITE
    mount_material: str = SupplierMaterials.B_WHITE
    pallet_count: int | None = None
    freight_cost: float | None = None
    die_cost: float | None = None


@dataclass
class Scenario4Input(OutsourceInput):
    """Inputs for scenario 4."""

    imposition_hours: float | None = None


@dataclass
class Scenario5Input(OutsourceInput):
    """Inputs for scenario 5."""

    pass
