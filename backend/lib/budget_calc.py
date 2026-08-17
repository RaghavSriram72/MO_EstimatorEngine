from lib.classes import Form, Project, Scenario1, Scenario3, Scenario4, Scenario5

#change scenarios list as needed based on future changes
SCENARIOS = [Scenario1, Scenario3, Scenario4, Scenario5]

def optimize_budget(
                    name: str,
                    budget: int, 
                    print_forms: list[Form], 
                    standee_type: str, 
                    iteration_limit = 100,
                    debug = False,
                    **kwargs) -> int:
    """First iteration of budget optimization, just a binary search based on the static_cost_calculator code"""

    final_quantities = [0] * len(SCENARIOS)
    final_prices = [0] * len(SCENARIOS)
    index = 0
    for scenario in SCENARIOS:
        current_quantity = first_guess(budget)
        iteration = 0
        low = 0
        high = current_quantity * 2 # this times 2 multiplier is subject to change
        last_under = 0
        last_price_under = 0
        while iteration < iteration_limit or iteration_limit == 0: # pass 0 as the iteration limit to run until solution
            iteration = iteration + 1
            found_cost = scenario(name, print_forms, current_quantity, standee_type, **kwargs)
            # binary search if else tree
            if found_cost > budget:
                high = current_quantity - 1
                if last_under == high: #if last under budget quantity was 1 less than current, return that quantity
                    break
            else:
                last_under = current_quantity
                last_price_under = found_cost
                if found_cost == budget: # if exact budget achieved, return
                    break
                low = current_quantity + 1
                if low >= high:
                    if scenario(name, print_forms, high, standee_type, **kwargs) < budget:
                        high = high * 2 #expand search if high is actually below budget
                    else: #if not, then last under is just this one and move on
                        break
            current_quantity = (high + low) // 2
        final_quantities[index] = last_under
        final_prices[index] = last_price_under
    return final_quantities, final_prices
            

def first_guess(budget: int)-> int:
    """Returns a first guess for the right number of standees to begin searching from"""
    # Currently using an arbitrary heuristic to calculate this value
    return budget / 1000