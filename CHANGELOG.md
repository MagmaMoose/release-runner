# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Added

- Shared public GitHub App auth through the Cloudflare Worker token broker.
- Repository CI for actionlint, markdownlint, Docker Bake validation, Bats shell tests, and Worker checks.

### Changed

- The repository release workflow now dogfoods this action directly.
- Convenience reusable workflows pin the root action at `v1` instead of `main`.

<!-- semantic-release will append entries above this line -->
