export default function createBuildOrderWorker(): Worker | undefined {
    return new Worker(new URL(/* webpackChunkName: "build-order-simulation" */ "./game/buildOrderSimulation.worker.ts", import.meta.url))
}
