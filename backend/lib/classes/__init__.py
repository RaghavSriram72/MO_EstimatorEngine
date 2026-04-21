from lib.classes.db import MOADB
from lib.classes.misc import UNIT_MAP, Complexity, Element, Form
from lib.classes.project import Project

FORM_WIDTH = 60.0
FORM_LENGTH = 80.0
PADDING = 0.25
FORM_AREA = FORM_WIDTH * FORM_LENGTH
SCENARIO_MAP = {
    1: "Internal Print / Internal Finishing / Packed Out (Box)",
    2: "Internal Print / Internal Finishing / Assembled",
    3: "Internal Print / Internal Finishing/External Assembly",
    4: "Internal Print / External Mount & Die Cut/External Assembly",
    5: "External Print / Finishing / Packout",
}

__all__ = [
    "Complexity",
    "Element",
    "Form",
    "MOADB",
    "Project",
    "FORM_WIDTH",
    "FORM_LENGTH",
    "PADDING",
    "FORM_AREA",
    "UNIT_MAP",
    "SCENARIO_MAP",
]
