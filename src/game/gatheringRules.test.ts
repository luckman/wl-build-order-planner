import { growingWoodTravelTime } from "./gatheringRules"
import { initialGameProfile } from "./gameProfile"

const { sawmillWoodTravelTime, woodTravelTimeIncreaseBase, maxWoodTravelTime, woodTravelTime } = initialGameProfile.map

test.each([
    [0, 0.5], [30, 0.8], [60, 1.1], [120, 1.4], [180, 1.7], [240, 2],
    [300, 2.3], [390, 2.6], [480, 2.9], [570, 3.2], [690, 3.5],
    [810, 3.8], [930, 4.1], [1080, 4.4], [1230, 4.7], [1380, 5],
])("default Sawmill travel changes at second %s", (time, travel) => {
    expect(growingWoodTravelTime(sawmillWoodTravelTime, time, woodTravelTimeIncreaseBase, maxWoodTravelTime)).toBeCloseTo(travel)
    if (time > 0) {
        const previous = time === 1380 ? 4.7 : travel - woodTravelTimeIncreaseBase
        expect(growingWoodTravelTime(sawmillWoodTravelTime, time - 0.001, woodTravelTimeIncreaseBase, maxWoodTravelTime)).toBeCloseTo(previous)
    }
})

test("default travel grows from game start without a Sawmill", () => {
    for (const [time, travel] of [[0, 3.5], [119.999, 3.5], [120, 3.8], [239.999, 3.8], [240, 4.1], [390, 4.4], [540, 4.7], [689.999, 4.7], [690, 5], [1800, 5]]) {
        expect(growingWoodTravelTime(woodTravelTime, time, woodTravelTimeIncreaseBase, maxWoodTravelTime)).toBeCloseTo(travel)
    }
})

test("custom increments, fractional initial travel, and a partial final step", () => {
    for (const [time, travel] of [[0, 1.25], [60, 2], [120, 2.75], [210, 3.1], [1800, 3.1]]) {
        expect(growingWoodTravelTime(1.25, time, 0.75, 3.1)).toBe(travel)
    }
})

test("zero initial travel lasts 30 seconds; zero growth and zero caps are supported", () => {
    expect(growingWoodTravelTime(0, 29.999, 0.5, 5)).toBe(0)
    expect(growingWoodTravelTime(0, 30, 0.5, 5)).toBe(0.5)
    expect(growingWoodTravelTime(0.5, 1800, 0, 5)).toBe(0.5)
    expect(growingWoodTravelTime(4, 0, 0.5, 2)).toBe(2)
    expect(growingWoodTravelTime(4, 1800, 0.5, 0)).toBe(0)
})

test("decimal rounding at a whole second does not add an extra interval", () => {
    expect(growingWoodTravelTime(0.2, 359.999, 1.6, 10)).toBeCloseTo(5)
    expect(growingWoodTravelTime(0.2, 360, 1.6, 10)).toBeCloseTo(6.6)
})
