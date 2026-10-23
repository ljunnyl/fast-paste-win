# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed
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
