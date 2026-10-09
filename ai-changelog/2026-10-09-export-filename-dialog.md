# Export filename dialog

- Export JSON now opens a native modal filename dialog, prefilled with the current faction's default filename.
- Users can rename the file, submit with Download JSON/Enter, or dismiss with Cancel/Escape. The .json extension is added when omitted; invalid filename characters produce an inline error.
- Updated documentation and existing export coverage for custom/default names, extension handling, invalid filenames, and cancellation.
- Validation: all 131 tests, production build, and TypeScript check passed.
