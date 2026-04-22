from lib.classes import Form, Project, Scenario1, Scenario2, Scenario3, Scenario4, Scenario5


def static_cost_calculator(
    name: str,
    print_forms: list[Form],
    num_standees: int,
    standee_type: str,
    **kwargs,
) -> list[Project]:
    """Calculate and return the total static cost for a project, summing all individual cost components."""
    return [
        scenario(name, print_forms, num_standees, standee_type, **kwargs)
        for scenario in [Scenario1, Scenario2, Scenario3, Scenario4, Scenario5]
    ]
