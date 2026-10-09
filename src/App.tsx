import { useMemo, useState } from "react"
import BuildOrderFiles from "./BuildOrderFiles"
import { type ScheduledAction, simulateBuildOrder } from "./game/buildSimulation"
import {
    buildOrderWithDependencies,
    type Faction,
    type FactionId,
    factions,
    itemCost,
    isRecruitable,
    type ItemKind,
    type PlannerItem,
} from "./game/gameData"
import { type EconomySettings, resourceAt, workerAllocationAt } from "./game/resourceSimulation"
import "./index.css"
import "./timeline.css"
import "./parallel-timeline.css"
import "./layout-overrides.css"
import "./build-order-files.css"

const iconSources: Record<string, string> = {
    lightCastle: require("./icons/buildings/light-castle.png"),
    lightSawmill: require("./icons/buildings/light-sawmill.png"),
    lightFarm: require("./icons/buildings/light-farm.png"),
    lightBarracks: require("./icons/buildings/light-barracks.png"),
    lightFactory: require("./icons/buildings/light-factory.png"),
    lightSanctuary: require("./icons/buildings/light-sanctuary.png"),
    lightShipyard: require("./icons/buildings/light-shipyard.png"),
    lightDwarvenForge: require("./icons/buildings/light-dwarven-forge.png"),
    lightHumanMonument: require("./icons/buildings/light-human-monument.png"),
    lightElvenTree: require("./icons/buildings/light-elven-tree.png"),
    lightAltarOfHeroes: require("./icons/buildings/light-altar-of-heroes.png"),
    lightTowerOfLightMagic: require("./icons/buildings/light-tower-of-light-magic.png"),
    lightCrossbowTower: require("./icons/buildings/light-crossbow-tower.png"),
    lightArtilleryTower: require("./icons/buildings/light-artillery-tower.png"),
    lightTowerOfMana: require("./icons/buildings/light-tower-of-mana.png"),
    lightWorker: require("./icons/units/light-worker.png"),
    lightSwordsman: require("./icons/units/light-swordsman.png"),
    lightWarsmith: require("./icons/units/light-warsmith.png"),
    lightArcher: require("./icons/units/light-archer.png"),
    lightKnight: require("./icons/units/light-knight.png"),
    lightCopter: require("./icons/units/light-copter.png"),
    lightHealer: require("./icons/units/light-healer.png"),
    lightGuardsman: require("./icons/units/light-guardsman.png"),
    lightBallista: require("./icons/units/light-ballista.png"),
    lightFoxRider: require("./icons/units/light-fox-rider.png"),
    lightWindMage: require("./icons/units/light-wind-mage.png"),
    lightBiker: require("./icons/units/light-biker.png"),
    lightSniper: require("./icons/units/light-sniper.png"),
    lightSloop: require("./icons/units/light-sloop.png"),
    lightCaravel: require("./icons/units/light-caravel.png"),
    lightGilbert: require("./icons/heroes/light-gilbert.png"),
    lightBerin: require("./icons/heroes/light-berin.png"),
    lightMiriel: require("./icons/heroes/light-miriel.png"),
    darkCitadel: require("./icons/buildings/dark-citadel.png"),
    darkSawmill: require("./icons/buildings/dark-sawmill.png"),
    darkPigsty: require("./icons/buildings/dark-pigsty.png"),
    darkBarracks: require("./icons/buildings/dark-barracks.png"),
    darkWorkshop: require("./icons/buildings/dark-workshop.png"),
    darkDarkGate: require("./icons/buildings/dark-dark-gate.png"),
    darkShipyard: require("./icons/buildings/dark-shipyard.png"),
    darkGoblinLab: require("./icons/buildings/dark-goblin-lab.png"),
    darkTotemOfOrcs: require("./icons/buildings/dark-totem-of-orcs.png"),
    darkUndeadObelisk: require("./icons/buildings/dark-undead-obelisk.png"),
    darkAltarOfHeroes: require("./icons/buildings/dark-altar-of-heroes.png"),
    darkTowerOfDarkMagic: require("./icons/buildings/dark-tower-of-dark-magic.png"),
    darkSlingshotTower: require("./icons/buildings/dark-slingshot-tower.png"),
    darkNapalmTower: require("./icons/buildings/dark-napalm-tower.png"),
    darkTowerOfMana: require("./icons/buildings/dark-tower-of-mana.png"),
    darkSlave: require("./icons/units/dark-slave.png"),
    darkGoon: require("./icons/units/dark-goon.png"),
    darkSkeletonArcher: require("./icons/units/dark-skeleton-archer.png"),
    darkBomber: require("./icons/units/dark-bomber.png"),
    darkWargRider: require("./icons/units/dark-warg-rider.png"),
    darkAeronaut: require("./icons/units/dark-aeronaut.png"),
    darkNecromancer: require("./icons/units/dark-necromancer.png"),
    darkAxeMaster: require("./icons/units/dark-axe-master.png"),
    darkCatapult: require("./icons/units/dark-catapult.png"),
    darkZombie: require("./icons/units/dark-zombie.png"),
    darkVenomspitter: require("./icons/units/dark-venomspitter.png"),
    darkDrill: require("./icons/units/dark-drill.png"),
    darkRocketeer: require("./icons/units/dark-rocketeer.png"),
    darkSchooner: require("./icons/units/dark-schooner.png"),
    darkGalleon: require("./icons/units/dark-galleon.png"),
    darkGrokk: require("./icons/heroes/dark-grokk.png"),
    darkJax: require("./icons/heroes/dark-jax.png"),
    darkEater: require("./icons/heroes/dark-eater.png"),
}
const initialEconomy: EconomySettings = {
    startingGold: 150,
    startingWood: 0,
    workerCount: 5,
    goldWorkers: 4,
    woodWorkers: 1,
    goldPerTrip: 50,
    woodPerTrip: 50,
    goldOutboundTravel: 4,
    goldReturnTravel: 4,
    goldGatherTime: 3.1,
    woodOutboundTravel: 4,
    woodReturnTravel: 4,
    woodGatherTime: 12.1,
    constructionStartDelay: 4,
}
const formatTime = (seconds: number) => {
    const tenths = Math.round(seconds * 10)
    return `${Math.floor(tenths / 600)}:${String(Math.floor(tenths / 10) % 60).padStart(2, "0")}${tenths % 10 ? `.${tenths % 10}` : ""}`
}
const formatTimeWithTenths = (seconds: number) => {
    const tenths = Math.round(seconds * 10)
    return `${Math.floor(tenths / 600)}:${String(Math.floor(tenths / 10) % 60).padStart(2, "0")}.${tenths % 10}`
}
const numberInput = (value: number, onChange: (value: number) => void, min = 0, step = 1) => (
    <input
        type="number"
        min={min}
        step={step}
        value={value}
        onChange={(event) => onChange(Math.max(min, Number(event.target.value) || 0))}
    />
)
type TimelineEvent = ScheduledAction & { index: number }
type TimelineLane = { label: string; events: TimelineEvent[] }

function createTimelineLanes(plan: ScheduledAction[]): TimelineLane[] {
    const availableLanes = new Map<string, Array<{ availableAt: number; events: TimelineEvent[] }>>()
    plan.forEach((action, index) => {
        if (action.blocked || action.commandTime === null || action.finishTime === null) {
            return
        }
        const group = isRecruitable(action.item) ? action.item.producer : "Construction"
        const lanes = availableLanes.get(group) ?? []
        let lane = lanes.find((candidate) => candidate.availableAt <= action.commandTime!)
        if (!lane) {
            lane = { availableAt: 0, events: [] }
            lanes.push(lane)
        }
        lane.events.push({ ...action, index })
        lane.availableAt = action.workerReturnTime ?? action.finishTime
        availableLanes.set(group, lanes)
    })
    return Array.from(availableLanes).flatMap(([group, lanes]) =>
        lanes.map((lane, index) => ({
            label: lanes.length === 1 ? group : `${group} ${index + 1}`,
            events: lane.events,
        })),
    )
}

export default function App() {
    const [factionId, setFactionId] = useState<FactionId>("light")
    const [buildOrder, setBuildOrder] = useState<PlannerItem[]>([])
    const [dependencyError, setDependencyError] = useState<string | null>(null)
    const [economy, setEconomy] = useState<EconomySettings>(initialEconomy)
    const faction = factions[factionId]
    const updateEconomy = (key: keyof EconomySettings, value: number) =>
        setEconomy((current) => ({ ...current, [key]: value }))
    const initialWorkerCount = economy.goldWorkers + economy.woodWorkers
    const initialFoodUsed = initialWorkerCount * 2
    const [hoverTime, setHoverTime] = useState<number | null>(null)
    const [baseFoodLimit, setBaseFoodLimit] = useState(20)
    const [foodPerFarm, setFoodPerFarm] = useState(20)
    const maxGoldWorkers = Math.max(
        1,
        Math.ceil(
            (economy.goldOutboundTravel + economy.goldGatherTime + economy.goldReturnTravel) / economy.goldGatherTime,
        ),
    )
    const scheduled = useMemo(
        () =>
            simulateBuildOrder(
                buildOrder,
                economy,
                initialFoodUsed,
                baseFoodLimit,
                foodPerFarm,
                faction.startingTownHall,
            ),
        [baseFoodLimit, buildOrder, economy, faction.startingTownHall, foodPerFarm, initialFoodUsed],
    )
    const deliveries = scheduled.deliveries
    const plan = scheduled.plan
    const spending = plan.flatMap(({ cost, commandTime }) =>
        commandTime === null ? [] : [{ time: commandTime, gold: -cost.gold, wood: -cost.wood }],
    )
    const lastCompletionTime = Math.max(0, ...plan.map(({ finishTime }) => finishTime ?? 0))
    const endTime = Math.max(90, lastCompletionTime + 30)
    const samples = useMemo(
        () =>
            Array.from({ length: Math.ceil(endTime / 5) + 1 }, (_, index) =>
                resourceAt(economy, deliveries, spending, Math.min(endTime, index * 5)),
            ),
        [deliveries, economy, endTime, spending],
    )
    const totalGold = Math.max(...samples.map(({ gold }) => gold), 1),
        totalWood = Math.max(...samples.map(({ wood }) => wood), 1)
    const foodSamples = useMemo(
        () =>
            samples.map(({ time }) => {
                const completed = plan.filter(({ item, finishTime }) => finishTime !== null && finishTime <= time)
                const units = plan
                    .filter(
                        ({ item, commandTime }) => isRecruitable(item) && commandTime !== null && commandTime <= time,
                    )
                    .reduce((total, { item }) => total + item.food, initialFoodUsed)
                const farms = completed.filter(({ item }) => item.id === "farm" || item.id === "pigsty").length
                return { time, used: units, limit: baseFoodLimit + farms * foodPerFarm }
            }),
        [baseFoodLimit, foodPerFarm, initialFoodUsed, plan, samples],
    )
    const allocation = (key: "goldWorkers" | "woodWorkers", value: number) =>
        setEconomy((current) => {
            const updated = { ...current, [key]: Math.floor(value) }
            return { ...updated, workerCount: updated.goldWorkers + updated.woodWorkers }
        })
    const inspectedTime = hoverTime ?? endTime
    const inspectedResources = resourceAt(economy, deliveries, spending, inspectedTime)
    const inspectedFood =
        initialFoodUsed +
        plan
            .filter(
                ({ item, commandTime }) => isRecruitable(item) && commandTime !== null && commandTime <= inspectedTime,
            )
            .reduce((total, { item }) => total + item.food, 0)
    const inspectedLimit =
        baseFoodLimit +
        plan.filter(
            ({ item, finishTime }) =>
                (item.id === "farm" || item.id === "pigsty") && finishTime !== null && finishTime <= inspectedTime,
        ).length *
            foodPerFarm
    const tooltip = (
        <>
            <div>{formatTimeWithTenths(inspectedTime)}</div>
            <div>Gold: {Math.round(inspectedResources.gold)}</div>
            <div>Wood: {Math.round(inspectedResources.wood)}</div>
            <div>
                Food: {inspectedFood}/{inspectedLimit}
            </div>
        </>
    )
    const timelineLanes = useMemo(() => createTimelineLanes(plan), [plan])
    const blockedActions = plan.map((action, index) => ({ ...action, index })).filter(({ blocked }) => blocked)
    const timelineWidth = `${Math.max(100, (endTime / 90) * 100)}%`
    const timelineTicks = Array.from({ length: Math.floor(endTime / 20) + 1 }, (_, index) => index * 20)
    const latestCommand = [...plan].reverse().find(({ commandTime }) => commandTime !== null)
    const latestCommandTime = latestCommand?.commandTime ?? null
    const latestResources =
        latestCommandTime === null ? null : resourceAt(economy, deliveries, spending, latestCommandTime)
    const latestFoodUsed =
        latestCommandTime === null
            ? null
            : initialFoodUsed +
              plan
                  .filter(
                      ({ item, commandTime }) =>
                          isRecruitable(item) && commandTime !== null && commandTime <= latestCommandTime,
                  )
                  .reduce((total, { item }) => total + item.food, 0)
    const latestFoodLimit =
        latestCommandTime === null
            ? null
            : baseFoodLimit +
              plan.filter(
                  ({ item, finishTime }) =>
                      (item.id === "farm" || item.id === "pigsty") &&
                      finishTime !== null &&
                      finishTime <= latestCommandTime,
              ).length *
                  foodPerFarm
    const latestWorkers =
        latestCommandTime === null ? null : workerAllocationAt(economy, plan, latestCommandTime)
    return (
        <div className="sc2-shell">
            <header className="topbar">
                <div>
                    <span className="brand-mark">WL</span>
                    <strong>War Legends Build Order Planner</strong>
                </div>
                <nav>
                    <button className="active">Planner</button>
                    <button disabled>Settings</button>
                    <BuildOrderFiles faction={factionId} profile={{
                        economy: (() => { const { workerCount, ...settings } = economy; return settings })(),
                        baseFoodLimit, foodPerFarm,
                    }} plan={plan} onImport={result => {
                        setFactionId(result.faction)
                        setBuildOrder(result.buildOrder)
                        setEconomy(result.economy)
                        setBaseFoodLimit(result.baseFoodLimit)
                        setFoodPerFarm(result.foodPerFarm)
                        setDependencyError(null)
                        setHoverTime(null)
                    }} />
                </nav>
            </header>
            <main>
                <section className="title-row">
                    <div>
                        <p className="eyebrow">Economy timeline</p>
                        <h1>{faction.name} build order</h1>
                    </div>
                    <div className="factions">
                        {(Object.values(factions) as Faction[]).map((entry) => (
                            <button
                                key={entry.id}
                                className={entry.id === factionId ? "selected" : ""}
                                onClick={() => {
                                    setFactionId(entry.id)
                                    setBuildOrder([])
                                    setDependencyError(null)
                                }}
                            >
                                {entry.name}
                            </button>
                        ))}
                    </div>
                </section>
                <div className="workspace">
                    <aside className="action-panel panel">
                        <div className="panel-title">
                            <h2>Actions</h2>
                            <span>Click to add</span>
                        </div>
                        <div className="action-groups">
                            {dependencyError && <p role="alert">{dependencyError}</p>}
                            {(["building", "unit", "hero", "upgrade"] as ItemKind[]).map((kind) => (
                                <section key={kind}>
                                    <h3>{kind === "hero" ? "heroes" : `${kind}s`}</h3>
                                    <div className="action-grid">
                                        {faction.items
                                            .filter((item) => item.kind === kind)
                                            .map((item) => {
                                                const cost = itemCost(item, buildOrder, faction.startingTownHall)
                                                return (
                                                    <button
                                                        className="action"
                                                        key={item.id}
                                                        onClick={() => {
                                                            try {
                                                                setBuildOrder(buildOrderWithDependencies(faction, buildOrder, item))
                                                                setDependencyError(null)
                                                            } catch (error) {
                                                                setDependencyError((error as Error).message)
                                                            }
                                                        }}
                                                    >
                                                        <img src={iconSources[item.icon]} alt="" />
                                                        <span>{item.name}</span>
                                                        <small>
                                                            {cost.gold} gold · {cost.wood} wood{isRecruitable(item) ? ` · ${item.food} food` : ""} · {item.seconds}s
                                                        </small>
                                                    </button>
                                                )
                                            })}
                                    </div>
                                </section>
                            ))}
                        </div>
                    </aside>
                    <section className="planner-area">
                        <section className="economy panel">
                            <div className="panel-title">
                                <h2>Resource collection</h2>
                                <span>Editable game profile</span>
                            </div>
                            <div className="economy-grid">
                                <label>
                                    Starting gold
                                    {numberInput(economy.startingGold, (v) => updateEconomy("startingGold", v))}
                                </label>
                                <label>
                                    Starting wood
                                    {numberInput(economy.startingWood, (v) => updateEconomy("startingWood", v))}
                                </label>
                                <label>
                                    Initial gold miners
                                    {numberInput(economy.goldWorkers, (v) => allocation("goldWorkers", v))}
                                </label>
                                <label>
                                    Initial wood gatherers
                                    {numberInput(economy.woodWorkers, (v) => allocation("woodWorkers", v))}
                                </label>
                                <label>
                                    Gold per trip
                                    {numberInput(economy.goldPerTrip, (v) => updateEconomy("goldPerTrip", v))}
                                </label>
                                <label>
                                    Wood per trip
                                    {numberInput(economy.woodPerTrip, (v) => updateEconomy("woodPerTrip", v))}
                                </label>
                                <label>Base food limit{numberInput(baseFoodLimit, setBaseFoodLimit)}</label>
                                <label>Food per Farm / Pigsty{numberInput(foodPerFarm, setFoodPerFarm)}</label>
                                <label>
                                    Construction start delay (seconds)
                                    {numberInput(
                                        economy.constructionStartDelay,
                                        (v) => updateEconomy("constructionStartDelay", v),
                                        0,
                                        0.1,
                                    )}
                                </label>
                                <div className="worker-state">
                                    <b>{initialWorkerCount}</b>
                                    <span>
                                        initial workers · {initialFoodUsed} food · gold saturation {maxGoldWorkers}
                                    </span>
                                </div>
                            </div>
                            <p className="mechanics-note">
                                Gold uses one shared mine slot (4s out, 3.10s mining, 4s return). Initial gold miners
                                reach the mine 1 second sooner on their opening trip only; every later trip uses the
                                configured travel time. New workers automatically mine gold until the calculated
                                saturation of {maxGoldWorkers}, then gather wood. Wood trips run independently.
                                Each completed Sawmill resets wood travel to 0.5 seconds each way, increasing by
                                0.5 seconds per full minute afterward, up to 4 seconds.
                                Builders stop gathering during travel, construction, and return. The construction delay
                                applies to travel in each direction.
                            </p>
                        </section>
                        <section className="timeline panel">
                            <div className="panel-title">
                                <h2>Timeline</h2>
                                <span>{formatTime(endTime)} horizon · scrolls in 90-second views</span>
                            </div>
                            <div className="timeline-grid">
                                <div className="timeline-fixed timeline-labels">
                                    <ResourceLabel name="Gold" tone="gold" />
                                    <ResourceLabel name="Wood" tone="wood" />
                                    <ResourceLabel name="Food" tone="food" />
                                    <div className="time-scale-spacer" />
                                    {timelineLanes.map((lane) => (
                                        <div className="queue-label" key={lane.label}>{lane.label}</div>
                                    ))}
                                </div>
                                <div className="timeline-scroll">
                                    <div className="timeline-canvas" style={{ width: timelineWidth }}>
                                    <ResourceRow
                                        endTime={endTime}
                                        hoverTime={hoverTime}
                                        onHover={setHoverTime}
                                        tooltip={tooltip}
                                        tone="gold"
                                        maximum={totalGold}
                                        sampleTimes={samples.map(({ time }) => time)}
                                        values={samples.map(({ gold }) => gold)}
                                    />
                                    <ResourceRow
                                        endTime={endTime}
                                        hoverTime={hoverTime}
                                        onHover={setHoverTime}
                                        tooltip={tooltip}
                                        tone="wood"
                                        maximum={totalWood}
                                        sampleTimes={samples.map(({ time }) => time)}
                                        values={samples.map(({ wood }) => wood)}
                                    />
                                    <ResourceRow
                                        endTime={endTime}
                                        hoverTime={hoverTime}
                                        onHover={setHoverTime}
                                        tooltip={tooltip}
                                        tone="food"
                                        maximum={Math.max(...foodSamples.map(({ limit }) => limit), 1)}
                                        sampleTimes={foodSamples.map(({ time }) => time)}
                                        values={foodSamples.map(({ used }) => used)}
                                        limitValues={foodSamples.map(({ limit }) => limit)}
                                    />
                                    <div className="time-scale">
                                        {timelineTicks.map((time) => (
                                            <span key={time} style={{ left: `${(time / endTime) * 100}%` }}>
                                                {formatTime(time)}
                                            </span>
                                        ))}
                                    </div>
                                    <div className="queue-lanes">
                                        {timelineLanes.map((lane) => (
                                            <div className="queue-track" key={lane.label}>
                                                    {lane.events.map(
                                                        ({
                                                            item,
                                                            commandTime,
                                                            startTime,
                                                            finishTime,
                                                            workerReturnTime,
                                                            index,
                                                        }) => (
                                                            <button
                                                                className={`event ${item.kind}${item.kind === "hero" ? " unit" : ""}`}
                                                                key={`${item.id}-${index}`}
                                                                style={{
                                                                    left: `${(commandTime! / endTime) * 100}%`,
                                                                    width: `${Math.max(4, ((finishTime! - commandTime!) / endTime) * 100)}%`,
                                                                }}
                                                                title={`Command ${formatTime(commandTime!)} · start ${formatTime(startTime!)} · finish ${formatTime(finishTime!)}${workerReturnTime === null ? "" : ` · worker returns ${formatTime(workerReturnTime)}`}`}
                                                                onClick={() =>
                                                                    setBuildOrder((current) =>
                                                                        current.filter(
                                                                            (_, position) => position !== index,
                                                                        ),
                                                                    )
                                                                }
                                                            >
                                                                <img src={iconSources[item.icon]} alt="" />
                                                                <span>{item.name}</span>
                                                            </button>
                                                        ),
                                                    )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                </div>
                                <div className="timeline-fixed timeline-values">
                                    <ResourceValue value={inspectedResources.gold} />
                                    <ResourceValue value={inspectedResources.wood} />
                                    <ResourceValue value={inspectedFood} limit={inspectedLimit} />
                                    <div className="time-scale-spacer" />
                                    {timelineLanes.map((lane) => <div className="queue-value" key={lane.label} />)}
                                </div>
                            </div>
                            {blockedActions.map(({ item, index, blockedReason }) => (
                                <div className="blocked-event" key={`${item.id}-${index}`}>
                                    {item.name} — {blockedReason}
                                </div>
                            ))}
                            <p className="timeline-help">
                                Hover a resource graph for its exact time and amount. Food shows used capacity and its
                                limit. Production rows are individual queues. Construction includes outbound travel;
                                hover a construction or upgrade to see its start, completion, and worker return times.
                            </p>
                        </section>
                    </section>
                    <aside className="order panel">
                        <div className="panel-title">
                            <h2>Build order</h2>
                            <button className="clear" onClick={() => { setBuildOrder([]); setDependencyError(null) }} disabled={!buildOrder.length}>
                                Clear
                            </button>
                        </div>
                        {!buildOrder.length ? (
                            <p className="empty">Choose actions from the left.</p>
                        ) : (
                            <ol>
                                {plan.map(({ item, commandTime, blocked, blockedReason }, index) => (
                                    <li key={`${item.id}-${index}`}>
                                        <span className="order-number">{index + 1}</span>
                                        <img src={iconSources[item.icon]} alt="" />
                                        <div>
                                            <b>{item.name}</b>
                                            <small>
                                                {blocked || commandTime === null
                                                    ? blockedReason
                                                    : `Command ${formatTime(commandTime)}`}
                                            </small>
                                        </div>
                                        <button
                                            aria-label={`Remove ${item.name}`}
                                            onClick={() => {
                                                setDependencyError(null)
                                                setBuildOrder((current) =>
                                                    current.filter((_, position) => position !== index),
                                                )
                                            }}
                                        >
                                            ×
                                        </button>
                                    </li>
                                ))}
                            </ol>
                        )}
                        <div className="resource-summary">
                            <h3>Latest order state</h3>
                            {latestCommandTime === null || !latestResources || latestFoodUsed === null || latestFoodLimit === null || !latestWorkers ? (
                                <span>No command has been sent yet.</span>
                            ) : (
                                <>
                                    <span>Latest command <b>{formatTime(Math.ceil(latestCommandTime))}</b></span>
                                    <span>Gold <b>{Math.round(latestResources.gold)}</b></span>
                                    <span>Wood <b>{Math.round(latestResources.wood)}</b></span>
                                    <span>Food <b>{latestFoodUsed} / {latestFoodLimit}</b></span>
                                    <span>Total workers <b>{latestWorkers.total}</b></span>
                                    <span>Gathering gold <b>{latestWorkers.gold}</b></span>
                                    <span>Gathering wood <b>{latestWorkers.wood}</b></span>
                                    <span>Building, travelling, or idle <b>{latestWorkers.busyOrIdle}</b></span>
                                </>
                            )}
                        </div>
                    </aside>
                </div>
                <footer>
                    Trip timings follow the documented War Legends model. Starting state, worker allocation, and yields
                    are visible inputs—not assumed game facts.
                </footer>
            </main>
        </div>
    )
}
type ResourceRowProps = {
    tone: string
    values: number[]
    sampleTimes: number[]
    maximum: number
    limitValues?: number[]
    endTime: number
    hoverTime: number | null
    onHover: (time: number | null) => void
    tooltip: React.ReactNode
}
function ResourceRow({
    tone,
    values,
    sampleTimes,
    maximum,
    limitValues,
    endTime,
    hoverTime,
    onHover,
    tooltip,
}: ResourceRowProps) {
    const [active, setActive] = useState(false)
    const position = hoverTime === null ? 0 : (hoverTime / endTime) * 100
    return (
        <div
            className="resource-chart"
                onMouseMove={(event) => {
                    const box = event.currentTarget.getBoundingClientRect()
                    const time = Math.min(endTime, Math.max(0, ((event.clientX - box.left) / box.width) * endTime))
                    onHover(Math.round(time * 10) / 10)
                    setActive(true)
                }}
                onMouseLeave={() => {
                    onHover(null)
                    setActive(false)
                }}
            >
                {values.slice(0, -1).map((entry, index) => (
                    <span
                        key={index}
                        className={tone}
                        style={{
                            height: `${Math.max(2, (entry / maximum) * 100)}%`,
                            width: `${((sampleTimes[index + 1] - sampleTimes[index]) / endTime) * 100}%`,
                        }}
                    />
                ))}
                {limitValues && (
                    <div
                        className="limit-line"
                        style={{ bottom: `${(limitValues[limitValues.length - 1] / maximum) * 100}%` }}
                    />
                )}
                {hoverTime !== null && <div className="hover-line" style={{ left: `${position}%` }} />}
                {hoverTime !== null && active && (
                    <div
                        role="tooltip"
                        className={`resource-tooltip ${position > 50 ? "align-right" : ""}`}
                        style={{ left: `${position}%` }}
                    >
                        {tooltip}
                    </div>
                )}
        </div>
    )
}

function ResourceLabel({ name, tone }: { name: string; tone: string }) {
    return <div className="resource-label"><i className={tone} />{name}</div>
}

function ResourceValue({ value, limit }: { value: number; limit?: number }) {
    return <b className="resource-value">{Math.round(value)}{limit === undefined ? "" : ` / ${limit}`}</b>
}
