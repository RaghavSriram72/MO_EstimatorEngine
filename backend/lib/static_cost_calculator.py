from lib.classes import Project
from lib.globals import SCENARIO_MAP


def static_cost_calculator(project: Project, **kwargs) -> dict[int, float]:
    """Calculate and return the total static cost for a project, summing all individual cost components."""
    cost_per_scenario = {}
    for scenario_id in SCENARIO_MAP:
        cost_per_scenario[scenario_id] = project.get_static_cost(scenario_id, **kwargs)
    return cost_per_scenario
