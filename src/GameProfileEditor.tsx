import { initialGameProfile, type GameProfile } from "./game/gameProfile"
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
            {field("player", "startingMana", "Starting mana")}
            {field("player", "baseManaLimit", "Base mana capacity")}
            {field("player", "townHallLevel", `${names.townHall} level`, 1, 1, 24)}
            {field("player", "sawmillLevel", "Sawmill level", 1, 1, 24)}
            {field("player", "farmLevel", `${names.farm} level`, 1, 1, 24)}
            {field("player", "manaTowerLevel", "Tower of Mana level", 1, 1, 24)}
            {field("player", "barracksLevel", "Barracks level", 1, 1, 24)}
            {field("player", "industrialBuildingLevel", `${names.industrial} level`, 1, 1, 24)}
            {field("player", "arcaneBuildingLevel", `${names.arcane} level`, 1, 1, 24)}
            {field("player", "workerLevel", `${faction === "light" ? "Worker" : "Slave"} level`, 1, 1, 24)}
        </div>
        <p className="initial-allocation">
            Gold per trip: {yields.goldPerTrip} · Wood per trip: {yields.woodPerTrip} · Food per {names.farm}: {yields.foodPerFarm}
            {` · Mana capacity per Tower of Mana: +${yields.manaPerTower} · Mana regeneration: ${profile.basic.manaPerMinute}/minute`}
        </p>
        <div className="profile-actions">
        <button className="advanced-toggle" type="button" aria-expanded={advanced} aria-controls="advanced-profile"
            onClick={() => setAdvanced(current => !current)}>{advanced ? "Hide advanced" : "Advanced"}</button>
        <button className="reset-profile" type="button" onClick={() => onChange({
            basic: { ...initialGameProfile.basic }, map: { ...initialGameProfile.map },
            player: { ...initialGameProfile.player }, delays: { ...initialGameProfile.delays },
        })}>Reset to defaults</button>
        </div>
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
