import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from "react"
import { DragDropContext, Draggable, Droppable, type DropResult } from "@hello-pangea/dnd"
import { type parseBuildOrder } from "./game/buildOrderFile"
import BuildOrderFiles from "./BuildOrderFiles"
import ScrollDialog from "./ScrollDialog"
import UpgradeCards from "./UpgradeCards"
import EventTimeDialog from "./EventTimeDialog"
import { createScrollAction, GOLD_RUSH, isScrollAction } from "./game/scrolls"
import { earliestScrollTime } from "./game/scrollTiming"
import GameProfileEditor from "./GameProfileEditor"
import warLegendsLogo from "./icons/war-legends-logo.png"
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
import { manaAt, resourceAt, workerAllocationAt } from "./game/resourceSimulation"
import { economyFromProfile, type GameProfile } from "./game/gameProfile"
import { loadFactionProfiles, saveFactionProfiles } from "./game/profileStorage"
import { loadFactionDrafts, saveFactionDrafts } from "./game/draftStorage"
import type { BuildDraft } from "./game/draftStorage"
import { actionDuration } from "./game/playerLevels"
import "./index.css"
import "./timeline.css"
import "./parallel-timeline.css"
import "./layout-overrides.css"
import "./build-order-files.css"
import "./scrolls.css"

const iconSources: Record<string, string> = {
    lightGoldRush: require("./icons/scrolls/light-gold-rush.png"),
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
const TIMELINE_WINDOW_SECONDS = 120

const formatTime = (seconds: number) => {
    const tenths = Math.round(seconds * 10)
    return `${Math.floor(tenths / 600)}:${String(Math.floor(tenths / 10) % 60).padStart(2, "0")}${tenths % 10 ? `.${tenths % 10}` : ""}`
}
const formatTimeWithTenths = (seconds: number) => {
    const tenths = Math.round(seconds * 10)
    return `${Math.floor(tenths / 600)}:${String(Math.floor(tenths / 10) % 60).padStart(2, "0")}.${tenths % 10}`
}
type TimelineEvent = ScheduledAction & { index: number }
type TimelineLane = { label: string; events: TimelineEvent[] }

function actionTimingTitle({ commandTime, startTime, finishTime, workerReturnTime, blockedReason }:
    Pick<ScheduledAction, "commandTime" | "startTime" | "finishTime" | "workerReturnTime" | "blockedReason">) {
    if (commandTime === null || startTime === null || finishTime === null) return blockedReason
    return `Command ${formatTime(commandTime)} · start ${formatTime(startTime)} · finish ${formatTime(finishTime)}${workerReturnTime === null ? "" : ` · worker returns ${formatTime(workerReturnTime)}`}`
}

function createTimelineLanes(plan: ScheduledAction[]): TimelineLane[] {
    const availableLanes = new Map<string, Array<{ availableAt: number; events: TimelineEvent[] }>>()
    plan.forEach((action, index) => {
        if (action.blocked || action.commandTime === null || action.finishTime === null) {
            return
        }
        const group = action.item.kind === "scroll" ? "Scrolls and events"
            : isRecruitable(action.item) ? action.item.producer : "Construction"
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
    return Array.from(availableLanes).sort(([a], [b]) =>
        Number(a === "Scrolls and events") - Number(b === "Scrolls and events")).flatMap(([group, lanes]) =>
        lanes.map((lane, index) => ({
            label: lanes.length === 1 ? group : `${group} ${index + 1}`,
            events: lane.events,
        })),
    )
}

export default function App() {
    const [factionId, setFactionId] = useState<FactionId>("light")
    const [scrollDialogOpen, setScrollDialogOpen] = useState(false)
    const [editingEventId, setEditingEventId] = useState<string | null>(null)
    const nextOrderId = useRef(0)
    const withOrderIds = useCallback((items: PlannerItem[]) => items.map(item => "orderId" in item
        ? item as PlannerItem & { orderId: string }
        : { ...item, orderId: `action-${nextOrderId.current++}` }), [])
    const [gameProfiles, updateGameProfiles] = useState(loadFactionProfiles)
    const [buildOrders, updateBuildOrders] = useState(() => {
        const drafts = loadFactionDrafts(gameProfiles)
        return { light: { ...drafts.light, items: withOrderIds(drafts.light.items) }, dark: { ...drafts.dark, items: withOrderIds(drafts.dark.items) } }
    })
    const buildOrder = buildOrders[factionId].items
    const editingEvent = buildOrder.find(item => item.orderId === editingEventId)
    const opening = buildOrders[factionId].opening
    const setOpeningGoldWorkers = (goldWorkers: number) => {
        updateBuildOrders(current => ({ ...current, [factionId]: { ...current[factionId], opening: { type: "allocate-workers", goldWorkers } } }))
        setHoverTime(null)
    }
    useEffect(() => saveFactionDrafts(buildOrders), [buildOrders])
    const setBuildOrder = useCallback((update: SetStateAction<PlannerItem[]>) => {
        updateBuildOrders(current => {
            const items = typeof update === "function" ? update(current[factionId].items) : update
            return { ...current, [factionId]: { ...current[factionId], items: withOrderIds(items) } }
        })
    }, [factionId, withOrderIds])
    const [dependencyError, setDependencyError] = useState<string | null>(null)
    const gameProfile = gameProfiles[factionId]
    const setGameProfile = useCallback((profile: GameProfile) => {
        updateGameProfiles(current => ({ ...current, [factionId]: profile }))
    }, [factionId])
    useEffect(() => saveFactionProfiles(gameProfiles), [gameProfiles])
    const economy = useMemo(() => economyFromProfile(gameProfile, opening), [gameProfile, opening])
    const { baseFoodLimit } = gameProfile.player
    const { foodPerFarm } = economy
    const faction = factions[factionId]
    const initialWorkerCount = economy.goldWorkers + economy.woodWorkers
    const initialFoodUsed = initialWorkerCount * 2
    const [hoverTime, setHoverTime] = useState<number | null>(null)
    const reorderActions = ({ source, destination }: DropResult) => {
        if (!destination || source.index === destination.index) return
        if (displayPlan[source.index].item.kind === "scroll") return
        setBuildOrder(current => {
            const reordered = [...current]
            const sourceIndex = current.indexOf(displayPlan[source.index].item as typeof current[number])
            const destinationIndex = current.indexOf(displayPlan[destination.index].item as typeof current[number])
            if (sourceIndex < 0 || destinationIndex < 0) return current
            const [moved] = reordered.splice(sourceIndex, 1)
            reordered.splice(destinationIndex, 0, moved)
            return reordered
        })
        setDependencyError(null)
        setHoverTime(null)
    }
    const applyImport = useCallback((result: ReturnType<typeof parseBuildOrder>) => {
        setFactionId(result.faction)
        updateBuildOrders(current => ({ ...current, [result.faction]: { opening: result.opening, items: withOrderIds(result.buildOrder) } }))
        updateGameProfiles(current => ({ ...current, [result.faction]: result.gameProfile }))
        setDependencyError(null)
        setHoverTime(null)
    }, [withOrderIds])
    const applyTemplate = (draft: BuildDraft) => {
        updateBuildOrders(current => ({ ...current, [factionId]: { opening: draft.opening, items: withOrderIds(draft.items) } }))
        setDependencyError(null)
        setHoverTime(null)
        setEditingEventId(null)
    }
    const maxGoldWorkers = Math.max(
        1,
        Math.ceil(
            (2 * economy.goldTravelTime + economy.goldGatherTime) / economy.goldGatherTime,
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
    const scrollTimes = plan.filter(action => action.item.kind === "scroll").map(action => action.commandTime!)
    const minimumScrollTime = scrollTimes.length ? Math.max(...scrollTimes) + gameProfile.basic.timeBetweenScrolls + economy.orderDelay : 0
    const automaticScrollTime = earliestScrollTime(economy, plan, minimumScrollTime)
    const displayPlan = buildOrder.some(item => item.kind === "scroll") ? scheduled.orderedPlan : plan
    const spending = plan.flatMap(({ cost, commandTime }) =>
        commandTime === null ? [] : [{ time: commandTime, gold: -cost.gold, wood: -cost.wood }],
    )
    const lastCompletionTime = Math.max(0, ...plan.map(({ finishTime, commandTime }) => finishTime ?? commandTime ?? 0))
    const endTime = Math.max(TIMELINE_WINDOW_SECONDS, lastCompletionTime + 30)
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
            Array.from(new Set([
                ...samples.map(({ time }) => time),
                ...plan.flatMap(({ commandTime, finishTime }) => [commandTime, finishTime].filter((time): time is number => time !== null)),
            ])).sort((a, b) => a - b).map(time => {
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
    const latestCommand = [...scheduled.orderedPlan].reverse().find(({ commandTime }) => commandTime !== null)
    const latestCommandTime = latestCommand?.commandTime ?? null
    const inspectedTime = hoverTime ?? latestCommandTime ?? endTime
    const inspectedResources = resourceAt(economy, deliveries, spending, inspectedTime)
    const manaSampleTimes = Array.from(new Set([
        ...samples.map(({ time }) => time),
        ...plan.flatMap(({ item, finishTime }) => item.id === "tower-of-mana" && finishTime !== null ? [finishTime] : []),
        ...plan.flatMap(({ item, commandTime }) => item.kind === "scroll" && commandTime !== null ? [commandTime] : []),
    ])).sort((a, b) => a - b)
    const manaSamples = manaSampleTimes.map(time => manaAt(economy, plan, time))
    const inspectedMana = manaAt(economy, plan, inspectedTime)
    const latestMana = latestCommandTime === null ? null : manaAt(economy, plan, latestCommandTime)
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
            <div>Mana: {Math.floor(inspectedMana.mana)}/{inspectedMana.limit}</div>
            <div>
                Food: {inspectedFood}/{inspectedLimit}
            </div>
        </>
    )
    const timelineLanes = useMemo(() => createTimelineLanes(displayPlan), [displayPlan])
    const blockedActions = displayPlan.map((action, index) => ({ ...action, index })).filter(({ blocked }) => blocked)
    const timelineWidth = `${Math.max(100, (endTime / TIMELINE_WINDOW_SECONDS) * 100)}%`
    const timelineTicks = Array.from({ length: Math.floor(endTime / 20) + 1 }, (_, index) => index * 20)
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
                    <img className="brand-logo" src={warLegendsLogo} alt="" />
                    <strong>War Legends Build Order Planner</strong>
                </div>
                <nav>
                    <button className="active">Planner</button>
                    <BuildOrderFiles faction={factionId} profile={gameProfile} plan={plan} opening={opening} onImport={applyImport} onSelectTemplate={applyTemplate} />
                </nav>
            </header>
            <main>
                <div className="workspace">
                    <section className="title-row">
                        <div className="factions">
                            {(Object.values(factions) as Faction[]).map((entry) => (
                                <button
                                    key={entry.id}
                                    className={entry.id === factionId ? "selected" : ""}
                                    onClick={() => {
                                        setFactionId(entry.id)
                                        setDependencyError(null)
                                        setHoverTime(null)
                                    }}
                                >
                                    {entry.name}
                                </button>
                            ))}
                        </div>
                    </section>
                    <section className="planner-area">
                        <section className="action-panel panel" aria-label="Actions">
                            <div className="panel-title"><h2>Actions</h2></div>
                            <div className="action-groups">
                                {dependencyError && <p role="alert">{dependencyError}</p>}
                                {(["building", "unit", "hero", "upgrade"] as ItemKind[]).map((kind) => (
                                    <section key={kind} aria-label={kind === "hero" ? "heroes" : `${kind}s`}>
                                        {kind === "upgrade" ? <UpgradeCards key={faction.id} faction={faction} buildOrder={buildOrder} iconSources={iconSources}
                                            onAdd={item => {
                                                try {
                                                    setBuildOrder(buildOrderWithDependencies(faction, buildOrder, item))
                                                    setDependencyError(null)
                                                } catch (error) {
                                                    setDependencyError((error as Error).message)
                                                }
                                            }} /> : <div className={`action-grid${kind === "hero" && factionId === "light" ? " hero-scroll-grid" : ""}`}>
                                            {faction.items
                                                .filter((item) => item.kind === kind)
                                                .map((item) => {
                                                    const cost = itemCost(item, buildOrder, faction.startingTownHall)
                                                    const food = isRecruitable(item) ? item.food : 0
                                                    const duration = Number(actionDuration(item, economy).toFixed(2))
                                                    return (
                                                        <button
                                                            className="action"
                                                            key={item.id}
                                                            aria-label={`${item.name} ${cost.gold} gold · ${cost.wood} wood · ${food} food · ${duration}s`}
                                                            title={`${item.name}\nGold: ${cost.gold}\nWood: ${cost.wood}\nFood: ${food}\nTime: ${duration}s`}
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
                                                            <small>
                                                                <span className="action-stat">{cost.gold}/{cost.wood}/{food}</span>
                                                            </small>
                                                        </button>
                                                    )
                                                })}
                                            {kind === "hero" && factionId === "light" && <>
                                                <span className="scroll-card-delimiter" aria-hidden="true" />
                                                <button className="action scroll-card" aria-label="Gold Rush 50 mana · 30s"
                                                    title="Gold Rush: 50 mana, +10 gold per mine exit for 30 seconds" onClick={() => setScrollDialogOpen(true)}>
                                                    <img src={iconSources.lightGoldRush} alt="" />
                                                    <small><span className="action-stat">{GOLD_RUSH.manaCost} mana</span></small>
                                                </button>
                                            </>}
                                        </div>}
                                    </section>
                                ))}
                            </div>
                        </section>
                        <section className="timeline panel">
                            <div className="panel-title">
                                <div className="timeline-title">
                                    <h2>Timeline</h2>
                                    <TimelineHelp />
                                </div>
                            </div>
                            <div className="timeline-grid">
                                <div className="timeline-fixed timeline-legend">
                                    <div className="resource-legend">
                                        <ResourceLegendRow name="Gold" tone="gold" value={inspectedResources.gold} />
                                        <ResourceLegendRow name="Wood" tone="wood" value={inspectedResources.wood} />
                                        <ResourceLegendRow name="Mana" tone="mana" value={Math.floor(inspectedMana.mana)} limit={inspectedMana.limit} />
                                        <ResourceLegendRow name="Food" tone="food" value={inspectedFood} limit={inspectedLimit} />
                                    </div>
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
                                        name="Gold and wood"
                                        chartClass="gold-wood-chart"
                                        showLatestTimestamp
                                        latestCommandTime={latestCommandTime}
                                        maximum={Math.max(totalGold, totalWood)}
                                        series={[
                                            { tone: "gold", values: samples.map(({ gold }) => gold), sampleTimes: samples.map(({ time }) => time) },
                                            { tone: "wood", values: samples.map(({ wood }) => wood), sampleTimes: samples.map(({ time }) => time) },
                                        ]}
                                    />
                                    <ResourceRow
                                        endTime={endTime}
                                        hoverTime={hoverTime}
                                        onHover={setHoverTime}
                                        tooltip={tooltip}
                                        name="Food and mana"
                                        chartClass="food-mana-chart"
                                        latestCommandTime={latestCommandTime}
                                        maximum={Math.max(...foodSamples.map(({ limit, used }) => Math.max(limit, used)), ...manaSamples.map(({ limit }) => limit), 1)}
                                        series={[
                                            { tone: "food", capacity: true, step: true, values: foodSamples.map(({ limit }) => limit), sampleTimes: foodSamples.map(({ time }) => time) },
                                            { tone: "mana", capacity: true, step: true, values: manaSamples.map(({ limit }) => limit), sampleTimes: manaSampleTimes },
                                            { tone: "food", step: true, values: foodSamples.map(({ used }) => used), sampleTimes: foodSamples.map(({ time }) => time) },
                                            { tone: "mana", values: manaSamples.map(({ mana }) => Math.floor(mana)), sampleTimes: manaSampleTimes },
                                        ]}
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
                                                                title={actionTimingTitle({ commandTime, startTime, finishTime, workerReturnTime })}
                                                                onClick={() =>
                                                                    setBuildOrder((current) =>
                                                                        current.filter(
                                                                            entry => entry !== item,
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
                            </div>
                            {blockedActions.length > 0 && <section className="blocked-actions" aria-label="Blocked actions">
                                <h3>{blockedActions.length} blocked {blockedActions.length === 1 ? "action" : "actions"}</h3>
                                {blockedActions.map(({ item, index, blockedReason }) => (
                                    <div className="blocked-event" key={`${item.id}-${index}`}>
                                        <img src={iconSources[item.icon]} alt="" />
                                        <div><b>#{index + 1} {item.name} — Blocked</b><p>{blockedReason}</p></div>
                                    </div>
                                ))}
                            </section>}
                        </section>
                        <section className="economy panel">
                            <div className="panel-title">
                                <h2>Resource collection</h2>
                                <span>Editable game profile</span>
                            </div>
                            <GameProfileEditor faction={factionId} profile={gameProfile} onChange={setGameProfile}>
                            <div className="economy-grid">
                                <div className="worker-state">
                                    <b>{initialWorkerCount}</b>
                                    <span>
                                        initial workers · {initialFoodUsed} food · gold saturation {maxGoldWorkers}
                                    </span>
                                </div>
                            </div>
                            <p className="mechanics-note">
                                New workers automatically mine gold until the calculated
                                saturation of {maxGoldWorkers}, then gather wood. Wood trips run independently.
                                Each completed Sawmill resets wood travel to {Math.min(4, economy.sawmillWoodTravelTime)} seconds each way, increasing by
                                0.5 seconds per full minute afterward, up to 4 seconds.
                                Builders stop gathering during travel, construction, and return. The construction delay
                                applies to travel in each direction.
                                The first build-order command and the second and later initial wood gathering commands
                                become available at {economy.orderDelay} seconds. The same delay applies after a recruitment building or prerequisites complete, before their first eligible command. Subsequent recruitment uses the normal queue. The first initial wood gatherer starts immediately.
                            </p>
                            </GameProfileEditor>
                        </section>
                    </section>
                    <aside className="order panel">
                        <div className="panel-title">
                            <h2>Build order</h2>
                            <button className="clear" onClick={() => { setBuildOrder([]); setOpeningGoldWorkers(Math.min(4, initialWorkerCount)); setDependencyError(null) }} disabled={!buildOrder.length && opening.goldWorkers === Math.min(4, initialWorkerCount)}>
                                Clear
                            </button>
                        </div>
                        <section className="opening-action" aria-label="Opening worker allocation">
                            <div className="worker-allocation">
                                <label htmlFor="initial-worker-allocation">Initial worker allocation ({initialWorkerCount} workers)</label>
                                <input id="initial-worker-allocation" type="range" min={1} max={4} step={1}
                                    aria-label="Initial gold miners"
                                    aria-valuetext={`${economy.goldWorkers} gold miners, ${economy.woodWorkers} wood gatherers`}
                                    value={economy.goldWorkers} onChange={event => {
                                        const value = event.target.valueAsNumber
                                        if (Number.isFinite(value)) setOpeningGoldWorkers(Math.min(4, Math.max(1, Math.round(value))))
                                    }} />
                                <p className="initial-allocation">Initial gold miners: {economy.goldWorkers} · Initial wood gatherers: {economy.woodWorkers}</p>
                            </div>
                        </section>
                        {!buildOrder.length ? (
                            <p className="empty">Choose actions from the panel above the timeline.</p>
                        ) : (
                            <DragDropContext onDragEnd={reorderActions}>
                            <Droppable droppableId="build-order">
                            {provided => <ol className="sortable-order" ref={provided.innerRef} {...provided.droppableProps}>
                                {displayPlan.map(({ item, commandTime, startTime, finishTime, workerReturnTime, blocked, blockedReason }, index) => (
                                    <Draggable key={(item as typeof buildOrder[number]).orderId} draggableId={(item as typeof buildOrder[number]).orderId} index={index} isDragDisabled={item.kind === "scroll"} disableInteractiveElementBlocking>
                                    {(drag, snapshot) => <li ref={drag.innerRef} {...drag.draggableProps} className={[blocked && "order-blocked", snapshot.isDragging && "order-dragging", item.kind === "scroll" && "order-timed-event"].filter(Boolean).join(" ") || undefined} title={actionTimingTitle({ commandTime, startTime, finishTime, workerReturnTime, blockedReason })}
                                        onClick={item.kind === "scroll" ? () => setEditingEventId((item as typeof buildOrder[number]).orderId) : undefined}>
                                        {item.kind === "scroll" ? <button className="scroll-order-marker" aria-label={`Change ${item.name} timestamp, action ${index + 1}`} title="Click to change timestamp">◷</button>
                                            : <button className="order-drag-handle" {...drag.dragHandleProps} aria-label={`Reorder ${item.name}, action ${index + 1}`} title="Drag to reorder; or press Space, arrow keys, then Space to drop">⠿</button>}
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
                                            onClick={event => {
                                                event.stopPropagation()
                                                setDependencyError(null)
                                                setBuildOrder((current) =>
                                                    current.filter(entry => entry !== item),
                                                )
                                            }}
                                        >
                                            ×
                                        </button>
                                    </li>}
                                    </Draggable>
                                ))}
                                {provided.placeholder}
                            </ol>}
                            </Droppable>
                            </DragDropContext>
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
                                    {latestMana && <span>Mana <b>{Math.floor(latestMana.mana)} / {latestMana.limit}</b></span>}
                                    <span>Total workers <b>{latestWorkers.total}</b></span>
                                    <span>Gathering gold <b>{latestWorkers.gold}</b></span>
                                    <span>Gathering wood <b>{latestWorkers.wood}</b></span>
                                    <span>Building, travelling, or idle <b>{latestWorkers.busyOrIdle}</b></span>
                                </>
                            )}
                        </div>
                    </aside>
                </div>
                {editingEvent && isScrollAction(editingEvent) && <EventTimeDialog key={editingEvent.orderId}
                    name={editingEvent.name} commandTime={editingEvent.commandTime}
                    onClose={() => setEditingEventId(null)} onSave={commandTime => {
                        setBuildOrder(current => current.map(item => item === editingEvent ? { ...item, commandTime } : item))
                        setEditingEventId(null)
                        setDependencyError(null)
                        setHoverTime(null)
                    }} />}
                {scrollDialogOpen && <ScrollDialog minimumTime={minimumScrollTime} automaticTime={automaticScrollTime}
                    onClose={() => setScrollDialogOpen(false)} onAdd={commandTime => {
                        setBuildOrder(current => [...current, createScrollAction({ type: "use-scroll", scrollId: "gold-rush", commandTime }, factionId)])
                        setScrollDialogOpen(false)
                        setDependencyError(null)
                        setHoverTime(null)
                    }} />}
                <footer>
                    Trip timings follow the documented War Legends model. Starting state, worker allocation, and yields
                    are visible inputs—not assumed game facts.
                </footer>
            </main>
        </div>
    )
}
type ResourceRowProps = {
    name: string
    chartClass: string
    series: Array<{ tone: string; values: number[]; sampleTimes: number[]; capacity?: boolean; step?: boolean }>
    maximum: number
    endTime: number
    hoverTime: number | null
    latestCommandTime: number | null
    showLatestTimestamp?: boolean
    onHover: (time: number | null) => void
    tooltip: React.ReactNode
}
function ResourceRow({
    name,
    chartClass,
    series,
    maximum,
    endTime,
    hoverTime,
    latestCommandTime,
    showLatestTimestamp,
    onHover,
    tooltip,
}: ResourceRowProps) {
    const [active, setActive] = useState(false)
    const position = hoverTime === null ? 0 : (hoverTime / endTime) * 100
    return (
        <div
            className={`resource-chart ${chartClass}`}
            aria-label={`${name} graph`}
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
                    <svg className="resource-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                        {series.map(series => (
                            <polyline
                                key={`${series.tone}-${series.capacity ? "capacity" : "current"}`}
                                className={`${series.tone}-line ${series.capacity ? "capacity-line" : "current-line"}`}
                                points={series.values.flatMap((value, index) => {
                                    const x = (series.sampleTimes[index] / endTime) * 100
                                    const point = `${x},${100 - (value / maximum) * 100}`
                                    return series.step && index > 0
                                        ? [`${x},${100 - (series.values[index - 1] / maximum) * 100}`, point]
                                        : [point]
                                }).join(" ")}
                            />
                        ))}
                    </svg>
                {latestCommandTime !== null && (
                    <div
                        className="latest-command-line"
                        aria-hidden="true"
                        style={{ left: `${(latestCommandTime / endTime) * 100}%` }}
                    />
                )}
                {showLatestTimestamp && latestCommandTime !== null && (
                    <div
                        className={`latest-command-caption${latestCommandTime / endTime < 0.08 ? " align-right" : ""}`}
                        aria-label={`Latest command ${formatTimeWithTenths(latestCommandTime)}`}
                        style={{ left: `${(latestCommandTime / endTime) * 100}%` }}
                    >
                        {formatTimeWithTenths(latestCommandTime)}
                    </div>
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

function TimelineHelp() {
    const [hovered, setHovered] = useState(false)
    const [focused, setFocused] = useState(false)
    return <div className="timeline-help-trigger" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
        <button type="button" className="timeline-help-button" aria-label="Timeline help" aria-describedby="timeline-help-text"
            onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        >?</button>
        <div id="timeline-help-text" className="timeline-help-tooltip" role="tooltip" hidden={!hovered && !focused}>
            Hover a graph to see resources at that time. Otherwise, values show the latest command.
            Hover an action to see its command, start, finish, and worker return times.
            Left-click a command to remove it from the build order.
        </div>
    </div>
}

function ResourceLegendRow({ name, tone, value, limit }: { name: string; tone: string; value: number; limit?: number }) {
    return <div className="resource-legend-row">
        <span className="resource-label"><i className={tone} />{name}</span>
        <ResourceValue value={value} limit={limit} />
    </div>
}

function ResourceValue({ value, limit, precision = 0 }: { value: number; limit?: number; precision?: number }) {
    return <b className="resource-value">{Number(value.toFixed(precision))}{limit === undefined ? "" : ` / ${limit}`}</b>
}
