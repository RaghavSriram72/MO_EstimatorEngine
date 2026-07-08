"""Debug-only cost line explanations for quote breakdown.

Toggle ``COST_DEBUG_ENABLED`` to False (or comment out the hook in ``main.py``)
before production deploys. When disabled, no extra fields are added to API responses.
"""

from __future__ import annotations

from typing import Any

from lib.classes.db_keys import UnitCostEntries
from lib.globals import BUSMARK_PADDING, BUSMARK_PRINT_FORM_LENGTH, PRINT_95_FORM_LENGTH, UNIT_MAP


def _print_form_length(scenario_id: int) -> float:
    return BUSMARK_PRINT_FORM_LENGTH if scenario_id in (1, 2, 3) else PRINT_95_FORM_LENGTH

# ── Toggle: set False for production ────────────────────────────────────────
COST_DEBUG_ENABLED = True


def maybe_attach_cost_explanations(scenario_dict: dict[str, Any], project: Any, scenario_id: int) -> dict[str, Any]:
    """Return *scenario_dict* unchanged when debug is off; else add ``_debug_explanations``."""
    if not COST_DEBUG_ENABLED:
        return scenario_dict
    explanations = build_cost_explanations(project, scenario_id)
    if not explanations:
        return scenario_dict
    return {**scenario_dict, "_debug_explanations": explanations}


def build_cost_explanations(project: Any, scenario_id: int) -> dict[str, str]:
    """Build human-readable formula strings keyed by cost field name."""
    out: dict[str, str] = {}
    for builder in _BUILDERS:
        key, text = builder(project, scenario_id)
        if key and text:
            out[key] = text
    return out


def _money(value: float) -> str:
    return f"${value:,.2f}"


def _num(value: float, digits: int = 2) -> str:
    return f"{value:,.{digits}f}"


def _get(project: Any, name: str, default: Any = None) -> Any:
    return getattr(project, name, default)


def _has_cost(project: Any, name: str) -> bool:
    value = getattr(project, name, None)
    return value is not None


def _unit_cost(db: Any, entry: str) -> float:
    return db.get_unit_cost(entry)


def _machine_entry(db: Any, name: str) -> dict[str, Any]:
    return db.get_unit_cost_entry(name)


def _explain_hardware_cost(project: Any, _scenario_id: int) -> tuple[str | None, str | None]:
    if not _has_cost(project, "hardware_cost"):
        return None, None
    per_standee = project.db.get_standee_data(project.standee_key, "hardware_cost")
    return (
        "hardware_cost",
        f"{_money(per_standee)}/standee × {_num(project.num_standees, 0)} standees = {_money(project.hardware_cost)}",
    )


def _explain_engineering_design_cost(project: Any, _scenario_id: int) -> tuple[str | None, str | None]:
    if not _has_cost(project, "engineering_design_cost"):
        return None, None
    return (
        "engineering_design_cost",
        f"Flat per-project fee from standee static costs ({project.standee_key.value}) = "
        f"{_money(project.engineering_design_cost)}",
    )


def _explain_blank_comp_cost(project: Any, _scenario_id: int) -> tuple[str | None, str | None]:
    if not _has_cost(project, "blank_comp_cost"):
        return None, None
    rate = _unit_cost(project.db, UnitCostEntries.BLANK_COMP)
    count = _get(project, "blank_comp_count", 1)
    return (
        "blank_comp_cost",
        f"{_money(rate)}/unit × {_num(count, 0)} units = {_money(project.blank_comp_cost)}",
    )


def _explain_color_comp_cost(project: Any, _scenario_id: int) -> tuple[str | None, str | None]:
    if not _has_cost(project, "color_comp_cost"):
        return None, None
    rate = _unit_cost(project.db, UnitCostEntries.COLOR_COMP)
    count = _get(project, "color_comp_count", 1)
    return (
        "color_comp_cost",
        f"{_money(rate)}/unit × {_num(count, 0)} units = {_money(project.color_comp_cost)}",
    )


def _explain_imposition_cost(project: Any, _scenario_id: int) -> tuple[str | None, str | None]:
    if not _has_cost(project, "imposition_cost"):
        return None, None
    rate = _unit_cost(project.db, UnitCostEntries.IMPOSITION_LABOR)
    hours = _get(project, "imposition_hours", project.print_forms_per_standee)
    return (
        "imposition_cost",
        f"{_money(rate)}/hr × {_num(hours)} hrs = {_money(project.imposition_cost)}\n"
        f"(imposition_hours defaults to print_forms_per_standee={_num(project.print_forms_per_standee, 0)})",
    )


def _explain_corrugate_cost(project: Any, _scenario_id: int) -> tuple[str | None, str | None]:
    if not _has_cost(project, "corrugate_cost"):
        return None, None
    rate = _unit_cost(project.db, UnitCostEntries.CORRUGATE)
    net_forms = project._get_net_corrugate_forms()
    base = project._get_base_corrugate_forms()
    overs_forms = project.print_forms_per_standee * project.overs
    return (
        "corrugate_cost",
        f"{_money(rate)}/form × {_num(net_forms)} forms = {_money(project.corrugate_cost)}\n"
        f"net forms = base ({_num(base, 0)}) + overs ({_num(overs_forms, 0)})\n"
        f"base = blank_forms_per_standee ({_num(project.blank_forms_per_standee, 0)}) × "
        f"num_standees ({_num(project.num_standees, 0)})",
    )


def _explain_print_form_cost(project: Any, _scenario_id: int) -> tuple[str | None, str | None]:
    if not _has_cost(project, "print_form_cost"):
        return None, None
    material = _get(project, "print_material", UnitCostEntries.ROLL_BUSMARK)
    entry = _machine_entry(project.db, material)
    unit = entry["unit"]
    rate = entry["cost"]
    total_forms = project.print_form_total
    lines = [
        f"Material: {material} @ {_money(rate)}/{unit}",
        f"print_form_total = print_forms_per_standee ({_num(project.print_forms_per_standee, 0)}) × "
        f"(num_standees ({_num(project.num_standees, 0)}) + overs ({_num(project.overs, 0)})) = {_num(total_forms, 0)}",
    ]
    pfl = _print_form_length(_scenario_id)
    is_busmark = _scenario_id in (1, 2, 3)
    if unit == "linear_foot":
        web_ups = _get(project, "busmark_web_ups", 1) if is_busmark else 0
        linear_inches = pfl * total_forms + (BUSMARK_PADDING * web_ups if is_busmark else 0)
        if is_busmark:
            linear_in_formula = (
                f"{pfl} × forms ({_num(total_forms, 0)}) + BUSMARK_PADDING ({BUSMARK_PADDING}) "
                f"× web_ups ({web_ups}) = {_num(linear_inches)}"
            )
        else:
            linear_in_formula = f"{pfl} × forms ({_num(total_forms, 0)}) = {_num(linear_inches)}"
        if "roll" in material:
            lines.append(f"linear_in = {linear_in_formula}")
            lines.append(f"cost = rate × UNIT_MAP[{unit}] × linear_in = {_money(project.print_form_cost)}")
        else:
            hi_tack = _machine_entry(project.db, UnitCostEntries.ROLL_HI_TACK)
            lines.append(f"linear_in = {linear_in_formula}")
            lines.append(f"substrate + hi-tack @ {_money(hi_tack['cost'])}/{hi_tack['unit']} × linear_in")
            lines.append(f"total = {_money(project.print_form_cost)}")
    else:
        lines.append(f"cost = rate × UNIT_MAP[{unit}] × forms = {_money(project.print_form_cost)}")
    return "print_form_cost", "\n".join(lines)


def _explain_machine_line(
    project: Any,
    scenario_id: int,
    cost_key: str,
    hours_key: str,
    machine_key: str | None,
    label: str,
    machine_name: str | None = None,
) -> tuple[str | None, str | None]:
    if not _has_cost(project, cost_key):
        return None, None
    machine = machine_name or (_get(project, machine_key) if machine_key else None)
    if not machine:
        return None, None
    entry = _machine_entry(project.db, machine)
    hourly = entry["cost"] * UNIT_MAP[entry["unit"]]
    hours = _get(project, hours_key, 0)
    throughput = entry["throughput"]
    throughput_unit = entry["throughput_unit"]
    setup = entry.get("setup_time", 0) * project.print_forms_per_standee
    pfl = _print_form_length(scenario_id)
    linear_inches = pfl * project.print_form_total
    effective_throughput = throughput / UNIT_MAP[throughput_unit]
    lines = [
        f"{label}: {_money(hourly)}/hr × {_num(hours)} hrs = {_money(getattr(project, cost_key))}",
        f"hours = linear_in ({_num(linear_inches)}) ÷ throughput "
        f"({_num(effective_throughput)}/hr) + setup ({_num(setup)})",
        f"machine={machine}, print_form_total={_num(project.print_form_total, 0)}",
    ]
    return cost_key, "\n".join(lines)


def _explain_print_cost(project: Any, _scenario_id: int) -> tuple[str | None, str | None]:
    machine_name = UnitCostEntries.RHO_1312 if _scenario_id == 4 else None
    return _explain_machine_line(project, _scenario_id, "print_cost", "print_hours", "print_machine", "Rho print", machine_name=machine_name)


def _explain_rollx_cost(project: Any, _scenario_id: int) -> tuple[str | None, str | None]:
    return _explain_machine_line(project, _scenario_id, "rollx_cost", "rollx_hours", None, "Roll-X", machine_name=UnitCostEntries.ROLLX)


def _explain_zund_cut_cost(project: Any, _scenario_id: int) -> tuple[str | None, str | None]:
    if not _has_cost(project, "zund_cut_cost"):
        return None, None
    entry = _machine_entry(project.db, UnitCostEntries.ZUND_CUTTER)
    hourly = entry["cost"] * UNIT_MAP[entry["unit"]]
    hours = _get(project, "zund_hours", 0)
    print_linear = sum(form.get_linear_inches() for form in project.print_forms)
    structure_minutes = (
        project.db.get_standee_data(project.standee_key, "zund_blank_form_minutes")
        * project.structure_forms_per_standee
        * project.num_standees
    )
    setup = entry.get("setup_time", 0) * round(project.blank_forms_per_standee)
    return (
        "zund_cut_cost",
        f"Zund: {_money(hourly)}/hr × {_num(hours)} hrs = {_money(project.zund_cut_cost)}\n"
        f"zund_hours = print cut time + structure time + setup\n"
        f"print linear_in={_num(print_linear)}, structure={_num(structure_minutes)} min, setup={_num(setup)} hr",
    )


def _explain_die_cost(project: Any, _scenario_id: int) -> tuple[str | None, str | None]:
    if not _has_cost(project, "die_cost"):
        return None, None
    die_rate = _unit_cost(project.db, UnitCostEntries.DIE_COST)
    blank_min = project.db.get_standee_data(project.standee_key, "cutting_die_blank_form_min")
    blank_part = project.structure_forms_per_standee * blank_min
    return (
        "die_cost",
        f"Blank die min ({_num(blank_part)}) + print die min (min of per-form mins vs linear-inch calc)\n"
        f"die_rate={_money(die_rate)}/inch → total={_money(project.die_cost)}",
    )


def _explain_pallet_material_cost(project: Any, _scenario_id: int) -> tuple[str | None, str | None]:
    if not _has_cost(project, "pallet_material_cost"):
        return None, None
    rate = _unit_cost(project.db, UnitCostEntries.PALLET)
    count = _get(project, "pallet_count", 0)
    return (
        "pallet_material_cost",
        f"{_money(rate)}/pallet × {_num(count, 0)} pallets = {_money(project.pallet_material_cost)}",
    )


def _explain_pallet_labor_cost(project: Any, _scenario_id: int) -> tuple[str | None, str | None]:
    if not _has_cost(project, "pallet_labor_cost"):
        return None, None
    rate = _unit_cost(project.db, UnitCostEntries.PALLET_LABOR)
    count = _get(project, "pallet_count", 0)
    return (
        "pallet_labor_cost",
        f"{_money(rate)}/pallet × {_num(count, 0)} pallets = {_money(project.pallet_labor_cost)}",
    )


def _explain_shipping_box_cost(project: Any, _scenario_id: int) -> tuple[str | None, str | None]:
    if not _has_cost(project, "shipping_box_cost"):
        return None, None
    supplier = _get(project, "corrugate_supplier")
    if supplier:
        unit_cost = _get(project, "mount_die_buyout_unit_cost")
        return (
            "shipping_box_cost",
            f"Outsource shipping box buyout: supplier curve unit_cost × num_standees × 1 form\n"
            f"unit_cost={_money(unit_cost or 0)}, standees={_num(project.num_standees, 0)} → "
            f"{_money(project.shipping_box_cost)}",
        )
    rate = _unit_cost(project.db, UnitCostEntries.SHIPPING_BOX)
    return (
        "shipping_box_cost",
        f"{_money(rate)}/standee × {_num(project.num_standees, 0)} standees = {_money(project.shipping_box_cost)}",
    )


def _explain_label_cost(project: Any, _scenario_id: int) -> tuple[str | None, str | None]:
    if not _has_cost(project, "label_cost"):
        return None, None
    desc = _unit_cost(project.db, UnitCostEntries.DESCRIPTION_LABEL)
    ship = _unit_cost(project.db, UnitCostEntries.SHIPPING_LABEL)
    return (
        "label_cost",
        f"(2 × {_money(desc)} desc + {_money(ship)} ship) × {_num(project.num_standees, 0)} standees = "
        f"{_money(project.label_cost)}",
    )


def _explain_instruction_sheet_cost(project: Any, _scenario_id: int) -> tuple[str | None, str | None]:
    if not _has_cost(project, "instruction_sheet_cost"):
        return None, None
    per_standee = project.db.get_standee_data(project.standee_key, "instruction_sheet_total_cost")
    return (
        "instruction_sheet_cost",
        f"{_money(per_standee)}/standee × {_num(project.num_standees, 0)} standees = "
        f"{_money(project.instruction_sheet_cost)}",
    )


def _explain_freight_cost(project: Any, scenario_id: int) -> tuple[str | None, str | None]:
    if not _has_cost(project, "freight_cost"):
        return None, None
    defaults = {
        3: UnitCostEntries.EXTERNAL_ASSEMBLY,
        4: UnitCostEntries.EXTERNAL_MOUNT_ASSEMBLY,
        5: UnitCostEntries.FULL_OUT_SOURCE,
    }
    default_key = defaults.get(scenario_id)
    default_note = f" (default unit_cost entry: {default_key})" if default_key else ""
    return (
        "freight_cost",
        f"Flat freight/kitting fee{default_note} = {_money(project.freight_cost)}",
    )


def _explain_kitting_and_assembly_cost(project: Any, _scenario_id: int) -> tuple[str | None, str | None]:
    if not _has_cost(project, "kitting_and_assembly_cost"):
        return None, None
    per_standee = project.db.get_standee_data(project.standee_key, "kitting_and_assembly")
    return (
        "kitting_and_assembly_cost",
        f"{_money(per_standee)}/standee × {_num(project.num_standees, 0)} standees = "
        f"{_money(project.kitting_and_assembly_cost)}",
    )


def _explain_packout(project: Any, _scenario_id: int) -> tuple[str | None, str | None]:
    if not _has_cost(project, "packout"):
        return None, None
    complexity = project.standee_key.split()[0]
    unit = project.db.get_packout(project.num_standees, project.print_forms_per_standee, complexity)
    return (
        "packout",
        f"packout lookup({complexity}, standees={_num(project.num_standees, 0)}, "
        f"print_forms_per_standee={_num(project.print_forms_per_standee, 0)}) = {_money(unit)}/standee\n"
        f"× {_num(project.num_standees, 0)} standees = {_money(project.packout)}",
    )


def _supplier_unit_cost(
    project: Any, supplier: str, material: str, curve_qty: float, material_type: str = ""
) -> tuple[float, str]:
    """Mirrors _get_supplier_cost: exact price-break if num_standees matches, else curve."""
    try:
        record = project.db.get_supplier_material_records(supplier, material, material_type)
    except Exception:
        return 0.0, f"no record for {supplier}/{material}"
    unit = record["unit"]
    num_standees = project.num_standees

    for pb in record.get("price_breaks", []):
        if pb.get("amount") is not None and abs(pb["amount"] - num_standees) < 1e-9:
            cost = pb["cost"] * UNIT_MAP[unit]
            return cost, f"Static price break @ {int(num_standees)} standees = {_money(cost)}"

    params = project.db.get_curve_params(supplier, material, material_type)
    if params is None:
        return 0.0, f"no curve for {supplier}/{material}"
    raw = params["a"] * curve_qty ** params["b"] + params["c"]
    scaled = raw * UNIT_MAP[unit]
    detail = (
        f"Curve @ qty={_num(curve_qty, 0)}: "
        f"({params['a']:.4g}×{curve_qty:.0f}^{params['b']:.4g}+{params['c']:.4g})×UNIT_MAP[{unit}]"
        f" = {_money(scaled)}"
    )
    return scaled, detail


def _explain_mount_die_buyout_cost(project: Any, _scenario_id: int) -> tuple[str | None, str | None]:
    if not _has_cost(project, "mount_die_buyout_cost"):
        return None, None
    supplier = _get(project, "corrugate_supplier", "")
    material = _get(project, "corrugate_material", "")
    is_pq = supplier == "pq"
    standees = project.num_standees
    lines = [f"Supplier={supplier}, material={material}"]

    print_forms = project.print_forms_per_standee
    structure_forms = project.structure_forms_per_standee
    print_type = "print" if is_pq else ""
    blank_type = "blank" if is_pq else ""

    print_unit, print_detail = _supplier_unit_cost(project, supplier, material, standees, print_type)
    blank_unit, blank_detail = _supplier_unit_cost(project, supplier, material, standees, blank_type)

    print_total = print_unit * standees * print_forms
    blank_total = blank_unit * standees * structure_forms

    if is_pq:
        lines.append(f"Print forms: {_money(print_unit)} × {standees} × {print_forms} = {_money(print_total)}")
        lines.append(f"  {print_detail}")
        lines.append(f"Blank forms: {_money(blank_unit)} × {standees} × {structure_forms} = {_money(blank_total)}")
        lines.append(f"  {blank_detail}")
    else:
        unit = print_unit or blank_unit
        forms = print_forms + structure_forms
        lines.append("unit_cost × standees × total_forms_per_standee")
        lines.append(f"{_money(unit)} × {standees} × {forms} = {_money(project.mount_die_buyout_cost)}")
        lines.append(f"  {print_detail}")

    lines.append(f"Total = {_money(project.mount_die_buyout_cost)}")
    return "mount_die_buyout_cost", "\n".join(lines)


def _explain_litho_buyout_cost(project: Any, _scenario_id: int) -> tuple[str | None, str | None]:
    if not _has_cost(project, "litho_buyout_cost"):
        return None, None
    supplier = _get(project, "supplier", "fosters")
    material = _get(project, "material", "fosters_print_form")
    sheets = _get(project, "litho_sheets_per_form", project.num_standees + project.overs)
    unit_cost = _get(project, "litho_buyout_unit_cost", 0)
    _, cost_detail = _supplier_unit_cost(project, supplier, material, sheets)
    return (
        "litho_buyout_cost",
        f"sheets_per_form = num_standees ({project.num_standees}) + overs ({project.overs}) = {sheets}\n"
        f"unit_cost: {cost_detail}\n"
        f"{_money(unit_cost)} × {sheets} sheets × {project.print_forms_per_standee} print_forms_per_standee "
        f"= {_money(project.litho_buyout_cost)}",
    )


_BUILDERS = [
    _explain_imposition_cost,
    _explain_blank_comp_cost,
    _explain_color_comp_cost,
    _explain_engineering_design_cost,
    _explain_hardware_cost,
    _explain_corrugate_cost,
    _explain_print_form_cost,
    _explain_print_cost,
    _explain_rollx_cost,
    _explain_zund_cut_cost,
    _explain_die_cost,
    _explain_pallet_material_cost,
    _explain_pallet_labor_cost,
    _explain_shipping_box_cost,
    _explain_label_cost,
    _explain_instruction_sheet_cost,
    _explain_freight_cost,
    _explain_kitting_and_assembly_cost,
    _explain_packout,
    _explain_mount_die_buyout_cost,
    _explain_litho_buyout_cost,
]
