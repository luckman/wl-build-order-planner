import { useCallback, useState, type RefObject } from "react"
import ActionCardMenu from "./ActionCardMenu"
import { type Faction, itemCost, type PlannerItem } from "./game/gameData"
import { orderedBuildings } from "./buildingDisplayOrder"

type Props = {
    faction: Faction
    buildOrder: PlannerItem[]
    iconSources: Record<string, string>
    portalContainer: RefObject<HTMLDivElement>
    onConfigure: (item: PlannerItem) => void
    onAdd: (item: PlannerItem) => void
}

export default function UpgradeCards({ faction, buildOrder, iconSources, portalContainer, onAdd, onConfigure }: Props) {
    const [open, setOpen] = useState<{ building: PlannerItem; anchor: HTMLButtonElement; last: boolean } | null>(null)
    const dismiss = useCallback(() => setOpen(null), [])
    const upgrades = open ? faction.items.filter(item => item.kind === "upgrade" && item.buildingId === open.building.id)
        .sort((a, b) => (a.level ?? 0) - (b.level ?? 0)) : []
    const close = () => {
        open?.anchor.focus()
        setOpen(null)
    }
    const buildings = orderedBuildings(faction).filter(building =>
        faction.items.some(item => item.kind === "upgrade" && item.buildingId === building.id))

    return <><div className="action-grid upgrade-grid">
        {buildings.map(building => {
            return <button type="button" className="action action-dropdown-card" key={building.id}
                aria-label={`${building.name} upgrade`} title={`${building.name} upgrade`} aria-haspopup="menu"
                aria-expanded={open?.building.id === building.id}
                aria-controls={open?.building.id === building.id ? `upgrade-menu-${faction.id}-${building.id}` : undefined}
                onClick={event => setOpen(open?.building.id === building.id ? null : { building, anchor: event.currentTarget, last: false })}
                onKeyDown={event => {
                    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                        event.preventDefault()
                        setOpen({ building, anchor: event.currentTarget, last: event.key === "ArrowUp" })
                    }
                }}>
                <span className="action-name">Upgrade</span>
                <img src={iconSources[building.icon]} alt="" />
                <span className="action-dropdown-arrow" aria-hidden="true">▾</span>
            </button>
        })}
    </div>{open && <ActionCardMenu anchor={open.anchor} last={open.last} portalContainer={portalContainer}
        id={`upgrade-menu-${faction.id}-${open.building.id}`} label={`${open.building.name} upgrades`} onDismiss={dismiss}>
        {upgrades.map(item => {
            const cost = itemCost(item, buildOrder, faction.startingTownHall)
            return <button type="button" role="menuitem" tabIndex={-1} key={item.id} onContextMenu={event => { event.preventDefault(); close(); onConfigure(item) }} onClick={() => { onAdd(item); close() }}>
                <img className="action-dropdown-option-icon" src={iconSources[item.icon]} alt="" />
                <span className="action-dropdown-option-name">{item.name}</span>
                <span className="upgrade-option-cost">{cost.gold} gold · {cost.wood} wood</span>
            </button>
        })}
    </ActionCardMenu>}</>
}
