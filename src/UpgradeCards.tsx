import { type Faction, itemCost, type PlannerItem } from "./game/gameData"
import { orderedBuildings } from "./buildingDisplayOrder"

type Props = {
    faction: Faction
    buildOrder: PlannerItem[]
    iconSources: Record<string, string>
    onAdd: (item: PlannerItem) => void
}

export default function UpgradeCards({ faction, buildOrder, iconSources, onAdd }: Props) {
    const [open, setOpen] = useState<{ building: PlannerItem; anchor: HTMLButtonElement; last: boolean } | null>(null)
    const menu = useRef<HTMLDivElement>(null)
    const upgrades = open ? faction.items.filter(item => item.kind === "upgrade" && item.buildingId === open.building.id)
        .sort((a, b) => (a.level ?? 0) - (b.level ?? 0)) : []
    const close = () => {
        open?.anchor.focus()
        setOpen(null)
    }
    useLayoutEffect(() => {
        if (!open || !menu.current) return
        const anchor = open.anchor.getBoundingClientRect()
        const popup = menu.current.getBoundingClientRect()
        menu.current.style.left = `${Math.max(8, Math.min(anchor.left, window.innerWidth - popup.width - 8))}px`
        menu.current.style.top = `${Math.max(8, anchor.bottom + popup.height + 4 <= window.innerHeight - 8
            ? anchor.bottom + 4 : anchor.top - popup.height - 4)}px`
        const buttons = menu.current.querySelectorAll<HTMLButtonElement>("button")
        buttons[open.last ? buttons.length - 1 : 0]?.focus()
    }, [open])
    useEffect(() => {
        if (!open) return
        const anchorBounds = open.anchor.getBoundingClientRect()
        const dismissOutside = (event: Event) => {
            if (event.target instanceof Node && !menu.current?.contains(event.target) && !open.anchor.contains(event.target)) {
                setOpen(null)
            }
        }
        const dismissOnScroll = (event: Event) => {
            // Opening via a scrolled-into-view trigger can leave a queued scroll
            // event. Only dismiss when scrolling actually moves the anchor.
            const current = open.anchor.getBoundingClientRect()
            if (current.x !== anchorBounds.x || current.y !== anchorBounds.y) dismissOutside(event)
        }
        const dismissOnResize = () => setOpen(null)
        document.addEventListener("pointerdown", dismissOutside)
        document.addEventListener("scroll", dismissOnScroll, true)
        window.addEventListener("resize", dismissOnResize)
        return () => {
            document.removeEventListener("pointerdown", dismissOutside)
            document.removeEventListener("scroll", dismissOnScroll, true)
            window.removeEventListener("resize", dismissOnResize)
        }
    }, [open])
    const buildings = orderedBuildings(faction).filter(building =>
        faction.items.some(item => item.kind === "upgrade" && item.buildingId === building.id))

    return <><div className="action-grid upgrade-grid">
        {buildings.map(building => {
            return <button type="button" className="action upgrade-card" key={building.id}
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
                <span className="upgrade-arrow" aria-hidden="true">▾</span>
            </button>
        })}
    </div>{open && createPortal(<div ref={menu} className="upgrade-menu" role="menu"
        id={`upgrade-menu-${faction.id}-${open.building.id}`} aria-label={`${open.building.name} upgrades`}
        onKeyDown={event => {
            if (event.key === "Escape" || event.key === "Tab") {
                if (event.key === "Escape") event.preventDefault()
                close()
            } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
                event.preventDefault()
                const buttons = Array.from(menu.current!.querySelectorAll<HTMLButtonElement>("button"))
                const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
                const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
                    : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length
                buttons[next]?.focus()
            }
        }}>
        {upgrades.map(item => {
            const cost = itemCost(item, buildOrder, faction.startingTownHall)
            return <button type="button" role="menuitem" tabIndex={-1} key={item.id} onClick={() => { onAdd(item); close() }}>
                <img className="upgrade-option-icon" src={iconSources[item.icon]} alt="" />
                <span className="upgrade-option-name">{item.name}</span>
                <span className="upgrade-option-cost">{cost.gold} gold · {cost.wood} wood</span>
            </button>
        })}
    </div>, document.body)}</>
}
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
