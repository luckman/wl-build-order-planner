import { useMemo, useState } from "react"
import { createDeliveries, resourceAt, type EconomySettings, type ResourceDelivery, type WorkerStart } from "./game/resourceSimulation"
import "./index.css"
import "./timeline.css"

const iconSources: Record<string, string> = {
    lightCastle: require("./icons/png/btn-building-terran-commandcenter.png"), lightSawmill: require("./icons/png/btn-building-terran-refinery.png"), lightFarm: require("./icons/png/btn-building-terran-supplydepot.png"), lightBarracs: require("./icons/png/btn-building-terran-barracks.png"), lightWorker: require("./icons/png/btn-unit-terran-scv.png"), lightSwordsman: require("./icons/png/btn-unit-terran-marine.png"),
    darkCitadel: require("./icons/png/btn-building-protoss-nexus.png"), darkSawmill: require("./icons/png/btn-building-protoss-assimilator.png"), darkPigsty: require("./icons/png/btn-building-protoss-pylon.png"), darkBarracs: require("./icons/png/btn-building-protoss-gateway.png"), darkSlave: require("./icons/png/btn-unit-protoss-probe.png"), darkGoon: require("./icons/png/btn-unit-protoss-zealot.png"),
}
type FactionId = "light" | "dark"
type ItemKind = "building" | "unit" | "upgrade"
type PlannerItem = { id: string; name: string; kind: ItemKind; gold: number; wood: number; food: number; seconds: number; producer: string; prerequisite?: string; icon: keyof typeof iconSources }
type Faction = { id: FactionId; name: string; workerName: string; items: PlannerItem[] }
const factions: Record<FactionId, Faction> = {
    light: { id: "light", name: "Light", workerName: "Worker", items: [
        { id: "castle", name: "Castle", kind: "building", gold: 500, wood: 500, food: 0, seconds: 60, producer: "Worker", icon: "lightCastle" }, { id: "castle-lvl-2", name: "Castle lvl 2", kind: "upgrade", gold: 200, wood: 200, food: 0, seconds: 45, producer: "Castle", prerequisite: "Castle", icon: "lightCastle" }, { id: "sawmill", name: "Sawmill", kind: "building", gold: 200, wood: 100, food: 0, seconds: 20, producer: "Worker", icon: "lightSawmill" }, { id: "farm", name: "Farm", kind: "building", gold: 150, wood: 200, food: 0, seconds: 25, producer: "Worker", icon: "lightFarm" }, { id: "barracs", name: "Barracs", kind: "building", gold: 200, wood: 150, food: 0, seconds: 30, producer: "Worker", icon: "lightBarracs" }, { id: "worker", name: "Worker", kind: "unit", gold: 150, wood: 0, food: 2, seconds: 18, producer: "Castle", icon: "lightWorker" }, { id: "swordsman", name: "Swordsman", kind: "unit", gold: 150, wood: 0, food: 3, seconds: 21, producer: "Barracs", prerequisite: "Barracs", icon: "lightSwordsman" },
    ] }, dark: { id: "dark", name: "Dark", workerName: "Slave", items: [
        { id: "citadel", name: "Citadel", kind: "building", gold: 500, wood: 500, food: 0, seconds: 60, producer: "Slave", icon: "darkCitadel" }, { id: "citadel-lvl-2", name: "Citadel lvl 2", kind: "upgrade", gold: 200, wood: 200, food: 0, seconds: 45, producer: "Citadel", prerequisite: "Citadel", icon: "darkCitadel" }, { id: "sawmill", name: "Sawmill", kind: "building", gold: 200, wood: 100, food: 0, seconds: 20, producer: "Slave", icon: "darkSawmill" }, { id: "pigsty", name: "Pigsty", kind: "building", gold: 150, wood: 200, food: 0, seconds: 25, producer: "Slave", icon: "darkPigsty" }, { id: "barracs", name: "Barracs", kind: "building", gold: 200, wood: 150, food: 0, seconds: 30, producer: "Slave", icon: "darkBarracs" }, { id: "slave", name: "Slave", kind: "unit", gold: 150, wood: 0, food: 2, seconds: 18, producer: "Citadel", icon: "darkSlave" }, { id: "goon", name: "Goon", kind: "unit", gold: 200, wood: 0, food: 4, seconds: 27, producer: "Barracs", prerequisite: "Barracs", icon: "darkGoon" },
    ] },
}
const initialEconomy: EconomySettings = { startingGold: 0, startingWood: 0, workerCount: 5, goldWorkers: 4, woodWorkers: 1, goldPerTrip: 50, woodPerTrip: 50, goldOutboundTravel: 4, goldReturnTravel: 4, goldGatherTime: 3, woodOutboundTravel: 4, woodReturnTravel: 4, woodGatherTime: 12 }
const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`
const numberInput = (value: number, onChange: (value: number) => void, min = 0) => <input type="number" min={min} value={value} onChange={(event) => onChange(Math.max(min, Number(event.target.value) || 0))} />
type ScheduledAction = { item: PlannerItem; blocked: boolean; commandTime: number | null; finishTime: number | null }
function scheduleBuildOrder(buildOrder: PlannerItem[], economy: EconomySettings, deliveries: ResourceDelivery[], initialFoodUsed: number, baseFoodLimit: number, foodPerFarm: number, initialTownHall: string): ScheduledAction[] {
    const spending: Array<{ time: number; gold: number; wood: number }> = []
    const scheduled: ScheduledAction[] = []
    // Each completed production building has its own single training slot.
    const producers: Array<{ name: string; availableAt: number }> = [{ name: initialTownHall, availableAt: 0 }]
    let commandAfter = 0
    buildOrder.forEach((item) => {
        const needsProducer = item.kind === "unit" || item.kind === "upgrade"
        const matchingProducers = producers.filter(({ name }) => name === item.producer)
        const possibleTimes = [commandAfter, ...deliveries.map(({ time }) => time), ...matchingProducers.map(({ availableAt }) => availableAt), ...scheduled.flatMap(({ finishTime, item: priorItem }) => (priorItem.id === "farm" || priorItem.id === "pigsty") && finishTime !== null ? [finishTime] : [])].filter((time) => time >= commandAfter).sort((a, b) => a - b)
        const commandTime = possibleTimes.find((time) => {
            if (needsProducer && !matchingProducers.some(({ availableAt }) => availableAt <= time)) return false
            const state = resourceAt(economy, deliveries, spending, time)
            const foodUsed = initialFoodUsed + scheduled.filter(({ item: priorItem, commandTime: priorCommand }) => priorItem.kind === "unit" && priorCommand !== null && priorCommand <= time).reduce((total, { item: priorItem }) => total + priorItem.food, 0)
            const foodLimit = baseFoodLimit + scheduled.filter(({ item: priorItem, finishTime }) => (priorItem.id === "farm" || priorItem.id === "pigsty") && finishTime !== null && finishTime <= time).length * foodPerFarm
            return state.gold >= item.gold && state.wood >= item.wood && (item.kind !== "unit" || foodUsed + item.food <= foodLimit)
        })
        if (commandTime === undefined) { scheduled.push({ item, blocked: true, commandTime: null, finishTime: null }); return }
        spending.push({ time: commandTime, gold: -item.gold, wood: -item.wood }); commandAfter = commandTime
        scheduled.push({ item, blocked: false, commandTime, finishTime: commandTime + item.seconds })
        if (needsProducer) {
            const producer = matchingProducers.filter(({ availableAt }) => availableAt <= commandTime).sort((a, b) => a.availableAt - b.availableAt)[0]
            producer.availableAt = commandTime + item.seconds
        } else if (item.kind === "building") {
            producers.push({ name: item.name, availableAt: commandTime + item.seconds })
        }
    })
    return scheduled
}

export default function App() {
    const [factionId, setFactionId] = useState<FactionId>("light")
    const [buildOrder, setBuildOrder] = useState<PlannerItem[]>([])
    const [economy, setEconomy] = useState<EconomySettings>(initialEconomy)
    const faction = factions[factionId]
    const updateEconomy = (key: keyof EconomySettings, value: number) => setEconomy((current) => ({ ...current, [key]: value }))
    const initialWorkerCount = economy.goldWorkers + economy.woodWorkers
    const initialFoodUsed = initialWorkerCount * 2
    const [hoverTime, setHoverTime] = useState<number | null>(null)
    const [baseFoodLimit, setBaseFoodLimit] = useState(20)
    const [foodPerFarm, setFoodPerFarm] = useState(20)
    const maxGoldWorkers = Math.max(1, Math.ceil((economy.goldOutboundTravel + economy.goldGatherTime + economy.goldReturnTravel) / economy.goldGatherTime))
    const scheduled = useMemo(() => {
        let starts: WorkerStart[] = []
        let deliveries = createDeliveries(economy, 600, starts)
        const initialTownHall = factionId === "light" ? "Castle" : "Citadel"
        let plan = scheduleBuildOrder(buildOrder, economy, deliveries, initialFoodUsed, baseFoodLimit, foodPerFarm, initialTownHall)
        for (let pass = 0; pass < buildOrder.length; pass += 1) {
            let assignedGold = economy.goldWorkers
            starts = plan.flatMap(({ item, finishTime }) => {
                if ((item.id !== "worker" && item.id !== "slave") || finishTime === null) return []
                const assignment = assignedGold < maxGoldWorkers ? "gold" : "wood"
                if (assignment === "gold") assignedGold += 1
                return [{ time: finishTime, assignment }]
            })
            deliveries = createDeliveries(economy, 600, starts)
            plan = scheduleBuildOrder(buildOrder, economy, deliveries, initialFoodUsed, baseFoodLimit, foodPerFarm, initialTownHall)
        }
        return { plan, deliveries }
    }, [baseFoodLimit, buildOrder, economy, factionId, foodPerFarm, initialFoodUsed, maxGoldWorkers])
    const deliveries = scheduled.deliveries
    const plan = scheduled.plan
    const spending = plan.flatMap(({ item, commandTime }) => commandTime === null ? [] : [{ time: commandTime, gold: -item.gold, wood: -item.wood }])
    const endTime = Math.max(60, ...plan.map(({ finishTime }) => finishTime ?? 0))
    const samples = useMemo(() => Array.from({ length: Math.ceil(endTime / 5) + 1 }, (_, index) => resourceAt(economy, deliveries, spending, index * 5)), [deliveries, economy, endTime, spending])
    const totalGold = Math.max(...samples.map(({ gold }) => gold), 1), totalWood = Math.max(...samples.map(({ wood }) => wood), 1)
    const foodSamples = useMemo(() => samples.map(({ time }) => {
        const completed = plan.filter(({ item, finishTime }) => finishTime !== null && finishTime <= time)
        const units = plan.filter(({ item, commandTime }) => item.kind === "unit" && commandTime !== null && commandTime <= time).reduce((total, { item }) => total + item.food, initialFoodUsed)
        const farms = completed.filter(({ item }) => item.id === "farm" || item.id === "pigsty").length
        return { time, used: units, limit: baseFoodLimit + farms * foodPerFarm }
    }), [baseFoodLimit, foodPerFarm, initialFoodUsed, plan, samples])
    const allocation = (key: "goldWorkers" | "woodWorkers", value: number) => setEconomy((current) => {
        const updated = { ...current, [key]: Math.floor(value) }
        return { ...updated, workerCount: updated.goldWorkers + updated.woodWorkers }
    })
    const inspectedTime = hoverTime ?? endTime
    const inspectedResources = resourceAt(economy, deliveries, spending, inspectedTime)
    const inspectedFood = initialFoodUsed + plan.filter(({ item, commandTime }) => item.kind === "unit" && commandTime !== null && commandTime <= inspectedTime).reduce((total, { item }) => total + item.food, 0)
    const inspectedLimit = baseFoodLimit + plan.filter(({ item, finishTime }) => (item.id === "farm" || item.id === "pigsty") && finishTime !== null && finishTime <= inspectedTime).length * foodPerFarm
    const tooltip = <><div>{inspectedTime.toFixed(1)}</div><div>Gold: {Math.round(inspectedResources.gold)}</div><div>Wood: {Math.round(inspectedResources.wood)}</div><div>Food: {inspectedFood}/{inspectedLimit}</div></>
    return <div className="sc2-shell"><header className="topbar"><div><span className="brand-mark">WL</span><strong>War Legends Build Order Planner</strong></div><nav><button className="active">Planner</button><button disabled>Settings</button><button disabled>Import / Export</button></nav></header><main>
        <section className="title-row"><div><p className="eyebrow">Economy timeline</p><h1>{faction.name} build order</h1></div><div className="factions">{(Object.values(factions) as Faction[]).map((entry) => <button key={entry.id} className={entry.id === factionId ? "selected" : ""} onClick={() => { setFactionId(entry.id); setBuildOrder([]) }}>{entry.name}</button>)}</div></section>
        <div className="workspace"><aside className="action-panel panel"><div className="panel-title"><h2>Actions</h2><span>Click to add</span></div><div className="action-groups">{(["building", "unit", "upgrade"] as ItemKind[]).map((kind) => <section key={kind}><h3>{kind}s</h3><div className="action-grid">{faction.items.filter((item) => item.kind === kind).map((item) => <button className="action" key={item.id} onClick={() => setBuildOrder((current) => [...current, item])}><img src={iconSources[item.icon]} alt="" /><span>{item.name}</span><small>{item.gold} gold · {item.wood} wood · {item.seconds}s</small></button>)}</div></section>)}</div></aside>
        <section className="planner-area"><section className="economy panel"><div className="panel-title"><h2>Resource collection</h2><span>Editable game profile</span></div><div className="economy-grid"><label>Starting gold{numberInput(economy.startingGold, (v) => updateEconomy("startingGold", v))}</label><label>Starting wood{numberInput(economy.startingWood, (v) => updateEconomy("startingWood", v))}</label><label>Initial gold miners{numberInput(economy.goldWorkers, (v) => allocation("goldWorkers", v))}</label><label>Initial wood gatherers{numberInput(economy.woodWorkers, (v) => allocation("woodWorkers", v))}</label><label>Gold per trip{numberInput(economy.goldPerTrip, (v) => updateEconomy("goldPerTrip", v))}</label><label>Wood per trip{numberInput(economy.woodPerTrip, (v) => updateEconomy("woodPerTrip", v))}</label><label>Base food limit{numberInput(baseFoodLimit, setBaseFoodLimit)}</label><label>Food per Farm / Pigsty{numberInput(foodPerFarm, setFoodPerFarm)}</label><div className="worker-state"><b>{initialWorkerCount}</b><span>initial workers · {initialFoodUsed} food · gold saturation {maxGoldWorkers}</span></div></div><p className="mechanics-note">Gold uses one shared mine slot (4s out, 3s mining, 4s return). New workers automatically mine gold until the calculated saturation of {maxGoldWorkers}, then gather wood. Wood trips run independently.</p></section>
        <section className="timeline panel"><div className="panel-title"><h2>Timeline</h2><span>{formatTime(endTime)} horizon</span></div><ResourceRow endTime={endTime} hoverTime={hoverTime} onHover={setHoverTime} tooltip={tooltip} inspectedValue={inspectedResources.gold} name="Gold" tone="gold" maximum={totalGold} values={samples.map(({ gold }) => gold)} /><ResourceRow endTime={endTime} hoverTime={hoverTime} onHover={setHoverTime} tooltip={tooltip} inspectedValue={inspectedResources.wood} name="Wood" tone="wood" maximum={totalWood} values={samples.map(({ wood }) => wood)} /><ResourceRow endTime={endTime} hoverTime={hoverTime} onHover={setHoverTime} tooltip={tooltip} inspectedValue={inspectedFood} inspectedLimit={inspectedLimit} name="Food" tone="food" maximum={Math.max(...foodSamples.map(({ limit }) => limit), 1)} values={foodSamples.map(({ used }) => used)} limitValues={foodSamples.map(({ limit }) => limit)} /><div className="time-scale">{Array.from({ length: Math.ceil(endTime / 20) + 1 }, (_, index) => <span key={index} style={{ left: `${index * 20 / endTime * 100}%` }}>{formatTime(index * 20)}</span>)}</div><div className="event-lane">{plan.map(({ item, commandTime, finishTime, blocked }, index) => blocked || commandTime === null || finishTime === null ? <div className="blocked-event" key={`${item.id}-${index}`}>{item.name} — waiting for resources, food, or producer</div> : <button className={`event ${item.kind}`} key={`${item.id}-${index}`} style={{ left: `${commandTime / endTime * 100}%`, width: `${Math.max(4, (finishTime - commandTime) / endTime * 100)}%` }} title={`Command ${formatTime(commandTime)} · finish ${formatTime(finishTime)}`} onClick={() => setBuildOrder((current) => current.filter((_, position) => position !== index))}><img src={iconSources[item.icon]} alt="" /><span>{item.name}</span></button>)}</div><p className="timeline-help">Hover a resource graph for its exact time and amount. Food shows used capacity and its limit. Each Castle/Citadel and Barracs trains one unit at a time. Construction-worker occupancy remains pending game data.</p></section></section>
        <aside className="order panel"><div className="panel-title"><h2>Build order</h2><button className="clear" onClick={() => setBuildOrder([])} disabled={!buildOrder.length}>Clear</button></div>{!buildOrder.length ? <p className="empty">Choose actions from the left.</p> : <ol>{plan.map(({ item, commandTime, blocked }, index) => <li key={`${item.id}-${index}`}><span className="order-number">{index + 1}</span><img src={iconSources[item.icon]} alt="" /><div><b>{item.name}</b><small>{blocked || commandTime === null ? "Waiting for resources, food, or producer" : `Command ${formatTime(commandTime)}`}</small></div><button aria-label={`Remove ${item.name}`} onClick={() => setBuildOrder((current) => current.filter((_, position) => position !== index))}>×</button></li>)}</ol>}<div className="resource-summary"><span>Initial gold workers <b>{economy.goldWorkers}</b></span><span>Initial wood workers <b>{economy.woodWorkers}</b></span><span>Mine deliveries <b>{deliveries.filter(({ gold }) => gold).length}</b></span></div></aside></div>
        <footer>Trip timings follow the documented War Legends model. Starting state, worker allocation, and yields are visible inputs—not assumed game facts.</footer></main></div>
}
type ResourceRowProps = {
    name: string
    tone: string
    values: number[]
    maximum: number
    limitValues?: number[]
    endTime: number
    hoverTime: number | null
    onHover: (time: number | null) => void
    tooltip: React.ReactNode
    inspectedValue: number
    inspectedLimit?: number
}
function ResourceRow({ name, tone, values, maximum, limitValues, endTime, hoverTime, onHover, tooltip, inspectedValue, inspectedLimit }: ResourceRowProps) {
    const [active, setActive] = useState(false)
    const position = hoverTime === null ? 0 : hoverTime / endTime * 100
    return <div className="resource-row">
        <div className="resource-label"><i className={tone} />{name}</div>
        <div className="resource-chart" onMouseMove={(event) => {
            const box = event.currentTarget.getBoundingClientRect()
            const time = Math.min(endTime, Math.max(0, (event.clientX - box.left) / box.width * endTime))
            onHover(Math.round(time * 10) / 10)
            setActive(true)
        }} onMouseLeave={() => { onHover(null); setActive(false) }}>
            {values.map((entry, index) => <span key={index} className={tone} style={{ height: `${Math.max(2, entry / maximum * 100)}%`, width: `${100 / values.length}%` }} />)}
            {limitValues && <div className="limit-line" style={{ bottom: `${limitValues[limitValues.length - 1] / maximum * 100}%` }} />}
            {hoverTime !== null && <div className="hover-line" style={{ left: `${position}%` }} />}
            {hoverTime !== null && active && <div role="tooltip" className={`resource-tooltip ${position > 50 ? "align-right" : ""}`} style={{ left: `${position}%` }}>{tooltip}</div>}
        </div>
        <b>{Math.round(inspectedValue)}{inspectedLimit === undefined ? "" : ` / ${inspectedLimit}`}</b>
    </div>
}
