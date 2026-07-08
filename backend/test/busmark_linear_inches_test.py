# import math
# import unittest

# from lib.globals import BUSMARK_PADDING, BUSMARK_PRINT_FORM_LENGTH, BUSMARK_ROLL_LENGTH


# class TestBusmarkLinearInches(unittest.TestCase):
#     """Compare the spreadsheet Busmark linear-inches formula against the current code."""

#     def test_linear_inches_vs_spreadsheet(self):
#         # -- Spreadsheet inputs (row 2 from spec) ----------------------------─
#         production_qty = 20      # E2 — production quantity
#         item_width     = 77      # H2 — Overall Finished Width (inches, runs along roll)
#         item_height    = 36      # I2 — Overall Finished Height (inches, goes across roll when rotated)
#         roll_width     = 54      # K2 — Roll Width in Inches
#         roll_length    = BUSMARK_ROLL_LENGTH   # L2 — Roll Length in Inches (1800)
#         sheet_length   = BUSMARK_PRINT_FORM_LENGTH  # S2 — Sheet Length (82.5)
#         web_up         = BUSMARK_PADDING            # U2 — Web Up per roll change (180)

#         # -- Spreadsheet formulas --------------------------------------------─
#         # O — pieces that fit across the roll width (rotated: shorter dim across)
#         across = math.floor(roll_width / item_height)

#         # P — rows per roll  =FLOOR((L2-U2)/S2, 1)
#         usable_length  = roll_length - web_up
#         rows_per_roll  = math.floor(usable_length / sheet_length)

#         # Q — pieces per roll  =O2*P2
#         pieces_per_roll = across * rows_per_roll

#         # R — sheets needed  =CEILING(E2/O2, 1)
#         sheets_needed = math.ceil(production_qty / across)

#         # T — linear inches needed (no web-up)  =S2*R2
#         linear_in_no_webup = sheet_length * sheets_needed

#         # V — web-ups required  =CEILING(E2/Q2, 1)
#         web_ups_required = math.ceil(production_qty / pieces_per_roll)

#         # Total linear inches  =T2+(U2*V2)
#         spreadsheet_linear_in = linear_in_no_webup + (web_up * web_ups_required)

#         # W — rolls  =(T2+(U2*V2))/L2
#         rolls = spreadsheet_linear_in / roll_length

#         # X — total linear ft  =W2*L2/12
#         spreadsheet_linear_ft = rolls * roll_length / 12

#         print("\n-- Spreadsheet calculation ------------------------------------------")
#         print(
#             f"  BUSMARK_PRINT_FORM_LENGTH={sheet_length}, "
#             f"BUSMARK_ROLL_LENGTH={roll_length}, BUSMARK_PADDING={web_up}"
#         )
#         print(f"  item {item_width}\" × {item_height}\" (rotated: {item_height}\" across, {item_width}\" along roll)")
#         print(f"  across (O):                  {across}")
#         print(f"  usable roll length (M):      {usable_length}\"  ({roll_length} - {web_up})")
#         print(f"  rows per roll (P):           {rows_per_roll}  (floor({usable_length}/{sheet_length}))")
#         print(f"  pieces per roll (Q):         {pieces_per_roll}")
#         print(f"  sheets needed (R):           {sheets_needed}  (ceil({production_qty}/{across}))")
#         print(f"  linear in, no web-up (T):   {linear_in_no_webup}\"  ({sheet_length} × {sheets_needed})")
#         print(f"  web-ups required (V):        {web_ups_required}  (ceil({production_qty}/{pieces_per_roll}))")
#         print(f"  total linear in:             {spreadsheet_linear_in}\"  ({linear_in_no_webup} + {web_up}×{web_ups_required})")
#         print(f"  rolls (W):                   {rolls:.3f}")
#         print(f"  total linear ft (X):         {spreadsheet_linear_ft:.2f} ft")

#         # -- Current code calculation ------------------------------------------
#         # InHouseProject._get_print_form_linear_inches():
#         #   forms_per_roll = floor((BUSMARK_ROLL_LENGTH - BUSMARK_PADDING) / BUSMARK_PRINT_FORM_LENGTH)
#         #   web_ups        = ceil(print_form_total / forms_per_roll)
#         #   linear_in      = BUSMARK_PRINT_FORM_LENGTH * print_form_total + BUSMARK_PADDING * web_ups
#         print_forms_per_standee = 1
#         overs = 0
#         print_form_total = print_forms_per_standee * (production_qty + overs)

#         code_forms_per_roll = math.floor((BUSMARK_ROLL_LENGTH - BUSMARK_PADDING) / BUSMARK_PRINT_FORM_LENGTH)
#         code_web_ups        = math.ceil(print_form_total / code_forms_per_roll)
#         code_linear_in      = BUSMARK_PRINT_FORM_LENGTH * print_form_total + BUSMARK_PADDING * code_web_ups

#         print("\n-- Current code calculation -----------------------------------------")
#         print(f"  BUSMARK_PRINT_FORM_LENGTH:   {BUSMARK_PRINT_FORM_LENGTH}\"")
#         print(f"  BUSMARK_ROLL_LENGTH:         {BUSMARK_ROLL_LENGTH}\"")
#         print(f"  BUSMARK_PADDING:             {BUSMARK_PADDING}\"")
#         print(f"  print_form_total:            {print_form_total}")
#         print(
#             f"  forms_per_roll:              {code_forms_per_roll}"
#             f"  (floor(({BUSMARK_ROLL_LENGTH}-{BUSMARK_PADDING})/{BUSMARK_PRINT_FORM_LENGTH}))"
#         )
#         print(f"  web_ups:                     {code_web_ups}  (ceil({print_form_total}/{code_forms_per_roll}))")
#         print(
#             f"  linear_in:                   {code_linear_in}\""
#             f"  ({BUSMARK_PRINT_FORM_LENGTH}×{print_form_total} + {BUSMARK_PADDING}×{code_web_ups})"
#         )

#         # -- Delta ------------------------------------------------------------─
#         diff = spreadsheet_linear_in - code_linear_in

#         print("\n-- Difference -------------------------------------------------------")
#         print(f"  spreadsheet:   {spreadsheet_linear_in}\"")
#         print(f"  code:          {code_linear_in}\"")
#         print(f"  difference:    {diff:+.1f}\"")

#         # Sanity-check spreadsheet arithmetic against known values from spec
#         self.assertEqual(across, 1)
#         self.assertEqual(rows_per_roll, 19)
#         self.assertEqual(pieces_per_roll, 19)
#         self.assertEqual(sheets_needed, 20)
#         self.assertAlmostEqual(linear_in_no_webup, 1650.0)
#         self.assertEqual(web_ups_required, 2)
#         self.assertAlmostEqual(spreadsheet_linear_in, 2010.0)
#         self.assertAlmostEqual(rolls, 1.1167, places=3)
#         self.assertAlmostEqual(spreadsheet_linear_ft, 167.50, places=1)

#         # Code should now match the spreadsheet exactly
#         self.assertEqual(code_web_ups, web_ups_required)
#         self.assertAlmostEqual(code_linear_in, spreadsheet_linear_in)
