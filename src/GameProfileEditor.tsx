import type { GameProfile } from "./game/gameProfile"
import { useState, type ReactNode } from "react"
import { playerLevelFields, yieldsFromLevels } from "./game/playerLevels"
import type { FactionId } from "./game/gameData"

const buildingNames = {
    light: { townHall: "Castle", farm: "Farm", industrial: "Factory", arcane: "Sanctuary" },
    dark: { townHall: "Citadel", farm: "Pigsty", industrial: "Workshop", arcane: "Dark Gate" },
}

export default function GameProfileEditor({ faction, profile, onChange, children }: {
    faction: FactionId; profile: GameProfile; onChange: (profile: GameProfile) => void; children?: ReactNode
}) {
    const [advanced, setAdvanced] = useState(false)
    const yields = yieldsFromLevels(profile.player)
    const names = buildingNames[faction]
    function field<Block extends keyof GameProfile>(block: Block, key: keyof GameProfile[Block], label: string, min = 0, step = 1, max?: number) {
        const isLevel = playerLevelFields.some(level => level === key)
        return <label key={String(key)}>{label}<input type="number" min={min} max={max} step={step} value={profile[block][key] as number}
            onChange={event => {
                const value = event.target.valueAsNumber
                if (!Number.isFinite(value)) return
                const normalized = isLevel ? Math.floor(value) : value
                onChange({ ...profile, [block]: { ...profile[block], [key]: Math.min(max ?? Infinity, Math.max(min, normalized)) } })
            }} /></label>
    }
    return <div className="profile-blocks">
        <div className="economy-grid">
            {field("player", "startingGold", "Starting gold")}
            {field("player", "startingWood", "Starting wood")}
            {field("player", "baseFoodLimit", "Base food limit")}
            <div className="worker-allocation">
                <label htmlFor="initial-worker-allocation">Initial worker allocation ({profile.map.goldWorkers + profile.map.woodWorkers} workers)</label>
                <input id="initial-worker-allocation" type="range" min={0} max={5} step={1}
                    aria-label="Initial gold miners"
                    aria-valuetext={`${profile.map.goldWorkers} gold miners, ${profile.map.woodWorkers} wood gatherers`}
                    value={Math.min(5, profile.map.goldWorkers)}
                    onChange={event => {
                        const goldWorkers = Math.min(5, Math.max(0, Math.round(event.target.valueAsNumber)))
                        if (!Number.isFinite(goldWorkers)) return
                        onChange({ ...profile, map: { ...profile.map, goldWorkers, woodWorkers: 5 - goldWorkers } })
                    }} />
                <p className="initial-allocation">Initial gold miners: {profile.map.goldWorkers} · Initial wood gatherers: {profile.map.woodWorkers}</p>
                {profile.map.goldWorkers + profile.map.woodWorkers !== 5 &&
                    <p className="initial-allocation">Moving the slider uses 5 workers.</p>}
            </div>
            {field("player", "townHallLevel", `${names.townHall} level`, 1, 1, 24)}
            {field("player", "sawmillLevel", "Sawmill level", 1, 1, 24)}
            {field("player", "farmLevel", `${names.farm} level`, 1, 1, 24)}
            {field("player", "barracksLevel", "Barracks level", 1, 1, 24)}
            {field("player", "industrialBuildingLevel", `${names.industrial} level`, 1, 1, 24)}
            {field("player", "arcaneBuildingLevel", `${names.arcane} level`, 1, 1, 24)}
            {field("player", "workerLevel", `${faction === "light" ? "Worker" : "Slave"} level`, 1, 1, 24)}
        </div>
        <p className="initial-allocation">
            Gold per trip: {yields.goldPerTrip} · Wood per trip: {yields.woodPerTrip} · Food per {names.farm}: {yields.foodPerFarm}
        </p>
        <button className="advanced-toggle" type="button" aria-expanded={advanced} aria-controls="advanced-profile"
            onClick={() => setAdvanced(current => !current)}>{advanced ? "Hide advanced" : "Advanced"}</button>
        {advanced && <div id="advanced-profile">
        <div className="economy-grid">
            {field("map", "goldTravelTime", "Gold travel time (seconds each way)", 0, 0.1)}
            {field("map", "woodTravelTime", "Wood travel time (seconds each way)", 0, 0.1)}
            {field("map", "sawmillWoodTravelTime", "Sawmill wood travel time (seconds)", 0, 0.1)}
        </div>
        <div className="economy-grid">
            {field("delays", "constructionStartDelay", "Construction start delay (seconds)", 0, 0.1)}
            {field("delays", "orderDelay", "Order delay (seconds)", 0, 0.1)}
        </div>
        {children}
        </div>}
    </div>
}
