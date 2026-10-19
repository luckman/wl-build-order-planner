import { MAX_PLAN_SECONDS, validateEconomyDurations } from "./game/plannerLimits"
import { economyFromProfile, initialGameProfile, scrollLevelFields, type GameProfile } from "./game/gameProfile"
import { useState, type ReactNode } from "react"
import { playerLevelFields, yieldsFromLevels } from "./game/playerLevels"
import type { FactionId } from "./game/gameData"

const buildingNames = {
    light: { townHall: "Castle", farm: "Farm", industrial: "Factory", arcane: "Sanctuary" },
    dark: { townHall: "Citadel", farm: "Pigsty", industrial: "Workshop", arcane: "Dark Gate" },
}

export default function GameProfileEditor({ faction, profile, onChange, onSave, onLoad, hasSavedProfile, children }: {
    faction: FactionId; profile: GameProfile; onChange: (profile: GameProfile) => void; children?: ReactNode
    onSave: () => void; onLoad: () => void; hasSavedProfile: boolean
}) {
    const [advanced, setAdvanced] = useState(false)
    const [durationError, setDurationError] = useState<string | null>(null)
    const yields = yieldsFromLevels(profile.player)
    const names = buildingNames[faction]
    const fieldHelp: Record<string, string> = {
        goldMiningTimeReduction: "Set a non-zero value if your worker has equipment that improves Gold Mining.",
        woodMiningTimeReduction: "Set a non-zero value if your worker has equipment that improves Wood Harvesting.",
        manaAccumulation: "Mana regenerated per minute, up to the current mana capacity.",
        manaFromManaWells: "Extra mana regenerated per minute for each owned mana well, up to mana capacity. Mana well is captured adds one well; Mana well is lost removes one at the selected timestamp, with no delays.",
        scrollCooldownReduction: `Reduces the ${profile.basic.timeBetweenScrolls}-second scroll cooldown by this percentage. Order delay applies afterward.`,
        goldTravelTime: "Travel time each way to mine gold. If your worker has no movement speed improvements, set this to 4.25 seconds. If your worker has a movement speed bonus of +10.7/min, set this to 3.75 seconds.",
        woodTravelTime: "Initial travel time each way to gather wood before a Sawmill completes.",
        sawmillWoodTravelTime: "Initial travel time each way to gather wood after each Sawmill completes.",
        woodTravelTimeIncreaseBase: "Travel time each way grows by this many seconds as the forest is logged, with or without a Sawmill.",
        maxWoodTravelTime: "Maximum wood travel time each way, with or without a Sawmill.",
        constructionStartDelay: "Builders stop gathering during travel, construction, and return. This delay applies to their travel in each direction.",
        orderDelay: "Applies to most player actions as requirements and resources become ready, and between commands when constructing or upgrading buildings. These waits overlap. Unit production has no extra spacing between commands, and worker availability adds no delay.",
    }
    function field<Block extends keyof GameProfile>(block: Block, key: keyof GameProfile[Block], label: string, min = 0, step = 1, max?: number, decimalPlaces?: number) {
        if (block === "map" || block === "delays") max = MAX_PLAN_SECONDS
        const isLevel = playerLevelFields.some(level => level === key) || scrollLevelFields.some(level => level === key)
        const id = `profile-${block}-${String(key)}`
        const help = fieldHelp[String(key)]
        const fieldValue = profile[block][key] as number
        return <div className="profile-field" key={String(key)}>
            <div className="profile-field-caption">
                <label htmlFor={id}>{label}</label>
                {help && <ProfileFieldHelp id={`${id}-help`} label={label} text={help} />}
            </div>
            <input id={id} aria-describedby={help ? `${id}-help` : undefined} type="number" min={min} max={max} step={step}
            value={decimalPlaces === undefined ? fieldValue : fieldValue.toFixed(decimalPlaces)}
            onChange={event => {
                const value = event.target.valueAsNumber
                if (!Number.isFinite(value)) return
                const normalized = isLevel ? Math.floor(value) : decimalPlaces === undefined ? value : Number(value.toFixed(decimalPlaces))
                const bounded = Math.min(max ?? Infinity, Math.max(min, normalized))
                // Number inputs can retain "1" when React considers it equal to "1.0".
                if (decimalPlaces !== undefined) event.currentTarget.value = bounded.toFixed(decimalPlaces)
                if (block === "player" && key === "startingMana") {
                    onChange({ ...profile, player: { ...profile.player, startingMana: bounded,
                        baseManaLimit: Math.max(profile.player.baseManaLimit, bounded) } })
                    return
                }
                if (block === "player" && key === "baseManaLimit") {
                    onChange({ ...profile, player: { ...profile.player, baseManaLimit: bounded,
                        startingMana: Math.min(profile.player.startingMana, bounded) } })
                    return
                }
                const next = { ...profile, [block]: { ...profile[block], [key]: bounded } }
                try { validateEconomyDurations(economyFromProfile(next)) } catch (reason) {
                    setDurationError((reason as Error).message)
                    return
                }
                setDurationError(null)
                onChange(next)
            }} />
        </div>
    }
    return <div className="profile-blocks">
        {durationError && <p role="alert">{durationError}</p>}
        <div className="economy-grid resource-profile-grid">
            <div className="resource-profile-column">
                {field("player", "startingGold", "Starting gold")}
                {field("player", "startingWood", "Starting wood")}
                {field("player", "townHallLevel", `${names.townHall} level`, 1, 1, 24)}
                {field("player", "sawmillLevel", "Sawmill level", 1, 1, 24)}
                {field("player", "workerLevel", `${faction === "light" ? "Worker" : "Slave"} level`, 1, 1, 24)}
                {field("player", "goldMiningTimeReduction", "Gold mining time reduction (seconds)", 0, 0.1, 1, 1)}
                {field("player", "woodMiningTimeReduction", "Wood gathering time reduction (seconds)", 0, 0.1, 5, 1)}
            </div>
            <div className="resource-profile-column">
                {field("player", "baseFoodLimit", "Base food limit", 0, 1, 40)}
                {field("player", "farmLevel", `${names.farm} level`, 1, 1, 24)}
                {field("player", "barracksLevel", "Barracks level", 1, 1, 24)}
                {field("player", "industrialBuildingLevel", `${names.industrial} level`, 1, 1, 24)}
                {field("player", "arcaneBuildingLevel", `${names.arcane} level`, 1, 1, 24)}
                {field("player", "shipyardLevel", "Shipyard level", 1, 1, 24)}
                {field("player", "altarOfHeroesLevel", "Altar of Heroes level", 1, 1, 24)}
                {faction === "light" && <>
                    {field("player", "lightGoldRushLevel", "Gold Rush scroll level", 1, 1, 6)}
                    {field("player", "lightLumberGatheringLevel", "Wood Gathering scroll level", 1, 1, 6)}
                </>}
                {faction === "dark" && field("player", "darkWhipLevel", "Whip scroll level", 1, 1, 6)}
                {faction === "dark" && field("player", "darkLegionsCallLevel", "Legion's Call scroll level", 1, 1, 6)}
            </div>
            <div className="resource-profile-column">
                {field("player", "manaTowerLevel", "Tower of Mana level", 1, 1, 24)}
                {field("player", "startingMana", "Starting mana", 0, 1, 100)}
                {field("player", "baseManaLimit", "Base mana capacity", profile.player.startingMana, 1, Math.max(100, profile.player.startingMana))}
                {field("player", "manaAccumulation", "Mana accumulation", 0, 1, 20)}
                {field("player", "manaFromManaWells", "Mana from mana wells", 0, 1, 100)}
                {field("player", "scrollCooldownReduction", "Scroll cooldown reduction (%)", 0, 1, 20)}
                <div className="profile-map-settings">
                    {field("map", "woodTravelTime", "Map: Wood travel time (seconds each way)", 0, 0.1)}
                </div>
            </div>
        </div>
        <p className="initial-allocation">
            Gold per trip: {yields.goldPerTrip} · Wood per trip: {yields.woodPerTrip} · Food per {names.farm}: {yields.foodPerFarm}
            {` · Mana capacity per Tower of Mana: +${yields.manaPerTower}`}
        </p>
        <div className="profile-actions">
        <button className="reset-profile" type="button" aria-label="Save profile" title={`Save the full profile only for the current faction (${faction === "light" ? "Light" : "Dark"}).`} onClick={onSave}>Save profile</button>
        <button className="reset-profile" type="button" aria-label="Load saved profile" title={`Load the saved profile only for the current faction (${faction === "light" ? "Light" : "Dark"}). The build order is preserved.`} disabled={!hasSavedProfile} onClick={onLoad}>Load saved profile</button>
        <button className="reset-profile" type="button" aria-label="Reset basic to defaults" title="Reset the main resource and level fields, keeping advanced settings" onClick={() => onChange({
            ...profile,
            map: { ...profile.map, woodTravelTime: initialGameProfile.map.woodTravelTime },
            player: { ...initialGameProfile.player,
                lightGoldRushLevel: faction === "light" ? initialGameProfile.player.lightGoldRushLevel : profile.player.lightGoldRushLevel,
                lightLumberGatheringLevel: faction === "light" ? initialGameProfile.player.lightLumberGatheringLevel : profile.player.lightLumberGatheringLevel,
                darkWhipLevel: faction === "dark" ? initialGameProfile.player.darkWhipLevel : profile.player.darkWhipLevel,
                darkLegionsCallLevel: faction === "dark" ? initialGameProfile.player.darkLegionsCallLevel : profile.player.darkLegionsCallLevel,
                massConstructionCostReduction: profile.player.massConstructionCostReduction,
            },
        })}>Reset basic to defaults</button>
        <button className="reset-profile" type="button" onClick={() => onChange({
            basic: { ...initialGameProfile.basic }, map: { ...initialGameProfile.map },
            player: { ...initialGameProfile.player }, delays: { ...initialGameProfile.delays },
        })}>Reset all</button>
        </div>
        <button className="advanced-toggle profile-advanced-toggle" type="button" aria-expanded={advanced} aria-controls="advanced-profile"
            onClick={() => setAdvanced(current => !current)}>{advanced ? "Hide advanced" : "Advanced"}</button>
        {advanced && <div id="advanced-profile">
        <div className="economy-grid resource-profile-grid">
            {field("map", "goldTravelTime", "Gold travel time (seconds each way)", 0, 0.1)}
            {field("map", "sawmillWoodTravelTime", "Sawmill wood travel time (seconds)", 0, 0.1)}
            {field("map", "woodTravelTimeIncreaseBase", "Wood travel increase (seconds)", 0, 0.01, undefined, 2)}
            {field("map", "maxWoodTravelTime", "Maximum wood travel time (seconds each way)", 0, 0.1)}
        </div>
        <div className="economy-grid resource-profile-grid">
            {field("delays", "constructionStartDelay", "Construction start delay (seconds)", 0, 0.1)}
            {field("delays", "orderDelay", "Order delay (seconds)", 0, 0.1)}
        </div>
        {children}
        </div>}
    </div>
}

function ProfileFieldHelp({ id, label, text }: { id: string; label: string; text: string }) {
    const [hovered, setHovered] = useState(false)
    const [focused, setFocused] = useState(false)
    return <span className="profile-help-trigger" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
        <button type="button" className="timeline-help-button" aria-label={`${label} help`} aria-describedby={id}
            onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
            onKeyDown={event => { if (event.key === "Escape") { setHovered(false); setFocused(false) } }}
        >?</button>
        <span id={id} className="timeline-help-tooltip profile-help-tooltip" role="tooltip" hidden={!hovered && !focused}>{text}</span>
    </span>
}
