// Hover tooltip descriptions for each cost line key shown in QuoteBreakdown.
export const COST_LINE_TOOLTIPS: Record<string, string> = {
    // ── Universal ────────────────────────────────────────────────────────────
    imposition_cost:
        "Labor cost for imposing print files — arranging artwork on the print sheet for optimal press use.",
    blank_comp_cost:
        "Cost of blank (unprinted) comp boards used for structural prototyping and die development.",
    color_comp_cost:
        "Cost of color-printed comp boards used to verify artwork and structural fit before production.",
    engineering_design_cost:
        "Flat fee covering engineering and design work, including structural dielines and artwork setup.",
    hardware_cost:
        "Cost of hardware components (nails, screws, connectors) included with each standee unit.",

    // ── Scenario ─────────────────────────────────────────────────────────────
    corrugate_cost:
        "Material cost for the corrugated sheets used to form the standee structure.",
    print_form_cost:
        "Cost of the print substrate (sheet or roll material) used to produce the printed graphic panels.",
    print_cost:
        "Machine time cost on the Rho wide-format printer for printing the graphic panels.",
    rollx_cost:
        "Machine time cost on the Roll-X laminator for applying protective laminate to printed panels.",
    zund_cut_cost:
        "Machine time cost on the Zünd digital cutter for cutting printed panels to their final shape.",
    die_cost:
        "Cost of the cutting die used to punch structural corrugate forms to the standee's shape.",
    pallet_material_cost:
        "Cost of pallets used to ship structural corrugate forms to an external assembly partner.",
    pallet_labor_cost:
        "Labor cost for loading and staging corrugate forms onto pallets for outbound shipment.",
    shipping_box_cost:
        "Cost of the retail shipping box used to pack each finished standee unit.",
    label_cost:
        "Cost of the printed label affixed to each shipping box.",
    instruction_sheet_cost:
        "Cost of the printed assembly instruction sheet included with each standee.",
    freight_cost:
        "Estimated freight cost for shipping materials or assemblies to an external partner.",
    kitting_and_assembly_cost:
        "In-house labor cost for kitting — assembling all components into finished standee units.",
    packout:
        "Labor and material cost for packing finished units into retail boxes for final shipment.",
    litho_buyout_cost:
        "Buyout cost for lithographic printing sourced from an external supplier (Fosters).",
    mount_die_buyout_cost:
        "Buyout cost for outsourced mounting and die-cutting of the graphic panels.",
};
