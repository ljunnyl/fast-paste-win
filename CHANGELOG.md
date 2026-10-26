# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.5.0] - 2026-10-26

### Added
- Pick window: **Shift+click** selects every image between the last one you clicked and this one (Explorer-style), and a **Range** box at the bottom accepts `1-20,25` and ticks those numbers as you type (reversed ranges are flipped, out-of-range numbers dropped, unreadable pieces ignored). Editing the box only re-applies what the box itself ticked; images you clicked by hand stay as they are. Picking 20 of 40 images used to take 20 clicks; now it is 2 clicks or one short line.

## [0.4.0] - 2026-10-23

### Added
- Shortcut settings: `pasteKey`, `viewKey`, `pasteAllKey`, `pickKey` in `userConfig` (defaults alt+v / alt+i / alt+a / alt+g). The band labels show the configured keys, and the `fast-paste-setup` skill writes `~/.claude/keybindings.json` from them, so users who already use Alt+V elsewhere can move the shortcuts without editing files by hand. The borrowed engine actions stay fixed.

## [0.3.0] - 2026-10-23

### Changed
- Pasting now inserts the saved PNG's `@path` directly instead of an `@imageN` alias. The alias needed a `prompt.mention` hook, which the Claude plugin directory does not yet list as a known event and therefore blocks. Direct paths use Claude Code's ordinary file mention, so nothing custom runs at read time. Trade-off: paths are visible in the prompt (kept short via `~/.cfp`).
- Removed the `prompt.mention` and `prompt.edit` hooks and the `chips` state; the missing-image check now looks for `.cfp` PNG mentions in the prompt text.
- README: "Notes for reviewers" section listing every engine call the mod makes, what it starts, writes and sends, so the directory's policy holds have their answer in the plugin itself.
- Removed `scripts/make_icon.ps1` from the repository: the directory holds any script file that nothing in the plugin runs. The icon is already generated; the script stays in git history.

## [0.2.0] - 2026-10-23

First public release, prepared for the Claude plugin directory.

### Changed
- Renamed the plugin from `fast-paste` to `fast-paste-win` so the name says it is Windows only and is not confused with generic listings.
- Prompt chip names are now `@image1`, `@image2` … (were Korean `@그림1`), and all band labels, toasts and the dropped-image notice are in English, so the plugin reads the same for every user.

### Added
- README in English with a Korean section, MIT license, 512px icon and `displayName`/`repository` fields: the directory's listing reads these.
- `fast-paste-setup` skill that writes the four key bindings into `~/.claude/keybindings.json`, because a mod cannot register shortcuts itself.
- `scripts/make_icon.ps1` to regenerate the icon.

## [0.1.0] - 2026-10-22

Internal version shared through the organization plugin library. Background clipboard watcher, paste / view / paste-all / pick band, keep-until-sent list, missing-image notice.
