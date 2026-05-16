from __future__ import annotations

from dataclasses import dataclass

B_WHITE = "b_white_1_s"
PQ = "pq"


@dataclass
class BaseInput:
    num_standees: int | None = None
    print_forms_per_standee: int | None = None
    structure_forms_per_standee: int | None = None
    num_overs: int | None = None
    imposition_hours: float | None = None
    blank_comp_count: float | None = None
    color_comp_count: float | None = None

@dataclass
class InHouseInput(BaseInput):
    print_hours: float | None = None
    rollx_hours: float | None = None
    zund_hours: float | None = None

@dataclass
class Scenario1Input(InHouseInput):
    pass

@dataclass
class Scenario2Input(InHouseInput):
    pass

@dataclass
class Scenario3Input(InHouseInput):
    pallet_count: int | None = None
    freight_cost: float | None = None

@dataclass
class OutsourceInput(BaseInput):
    print_hours: float | None = None
    corrugate_supplier: str = PQ
    corrugate_material: str = B_WHITE
    pallet_count: int | None = None
    freight_cost: float | None = None
    die_cost: float | None = None

@dataclass
class Scenario4Input(OutsourceInput):
    pass

@dataclass
class Scenario5Input(OutsourceInput):
    pass