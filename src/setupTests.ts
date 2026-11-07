// jsdom does not run Web Workers. The browser suite covers the worker path.
jest.mock("./createBuildOrderWorker", () => () => undefined)
