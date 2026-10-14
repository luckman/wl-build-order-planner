/** Each travel value lasts its rounded-up value times 30 seconds, with a 30-second minimum. */
export function growingWoodTravelTime(initialTravel: number, elapsed: number, increase: number, maximum: number) {
    let travel = Math.min(maximum, initialTravel)
    if (increase === 0) return travel
    let nextIncreaseAt = growthInterval(travel)
    let increments = 0
    while (travel < maximum && elapsed >= nextIncreaseAt) {
        increments++
        travel = Math.min(maximum, initialTravel + increments * increase)
        nextIncreaseAt += growthInterval(travel)
    }
    return travel
}

function growthInterval(travel: number) {
    // Decimal increments can land just above a whole second due to floating-point rounding.
    const tolerance = 4 * Number.EPSILON * Math.max(1, travel)
    return 30 * Math.max(1, Math.ceil(travel - tolerance))
}
