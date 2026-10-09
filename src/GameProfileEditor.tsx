import type { GameProfile } from "./game/gameProfile"
import { useState, type ReactNode } from "react"

export default function GameProfileEditor({ profile, onChange, children }: {
    profile: GameProfile; onChange: (profile: GameProfile) => void; children?: ReactNode
}) {
    const [advanced, setAdvanced] = useState(false)
    function field<Block extends keyof GameProfile>(block: Block, key: keyof GameProfile[Block], label: string, min = 0, step = 1) {
        return <label key={String(key)}>{label}<input type="number" min={min} step={step} value={profile[block][key] as number}
            onChange={event => {
                const value = event.target.valueAsNumber
                if (!Number.isFinite(value)) return
                const normalized = key === "goldWorkers" || key === "woodWorkers" ? Math.floor(value) : value
                onChange({ ...profile, [block]: { ...profile[block], [key]: Math.max(min, normalized) } })
            }} /></label>
    }
    return <div className="profile-blocks">
        <div className="economy-grid">
            {field("player", "startingGold", "Starting gold")}
            {field("player", "startingWood", "Starting wood")}
            {field("player", "goldPerTrip", "Gold per trip")}
            {field("player", "woodPerTrip", "Wood per trip")}
            {field("player", "baseFoodLimit", "Base food limit")}
            {field("player", "foodPerFarm", "Food per Farm / Pigsty")}
        </div>
        {!advanced && <p className="initial-allocation">
            Initial gold miners: {profile.map.goldWorkers} · Initial wood gatherers: {profile.map.woodWorkers}
        </p>}
        <button className="advanced-toggle" type="button" aria-expanded={advanced} aria-controls="advanced-profile"
            onClick={() => setAdvanced(current => !current)}>{advanced ? "Hide advanced" : "Advanced"}</button>
        {advanced && <div id="advanced-profile">
        <div className="economy-grid">
            {field("map", "goldWorkers", "Initial gold miners")}
            {field("map", "woodWorkers", "Initial wood gatherers")}
            {field("map", "goldTravelTime", "Gold travel time (seconds each way)", 0, 0.1)}
            {field("map", "woodTravelTime", "Wood travel time (seconds each way)", 0, 0.1)}
            {field("map", "sawmillWoodTravelTime", "Sawmill wood travel time (seconds)", 0, 0.1)}
        </div>
        <div className="economy-grid">
            {field("delays", "constructionStartDelay", "Construction start delay (seconds)", 0, 0.1)}
            {field("delays", "initialOrderDelay", "Initial order delay (seconds)", 0, 0.1)}
        </div>
        {children}
        </div>}
    </div>
}
