# Native Save As for JSON export

- Replaced the custom filename modal with showSaveFilePicker so supporting browsers display the operating system's directory/filename chooser.
- Suggest the faction's JSON filename and remember the export directory through a stable picker ID. Cancel exits quietly; write failures are reported and incomplete writes are aborted.
- Unsupported browsers retain the standard download flow, governed by browser save-location settings. Removed the custom dialog and its styles.
- Updated export tests and documentation; added native picker, cancellation, and failed-write coverage.
- Validation: all 134 tests in 7 suites, production build, and TypeScript check passed. Native picker behavior is covered with API mocks; unsupported-browser downloads are covered by the UI tests.
