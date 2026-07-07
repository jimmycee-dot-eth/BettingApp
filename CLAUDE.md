# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

This repository is an **empty scaffold**. As of this writing it contains only `LICENSE` (MIT) and `README.md`. There is no source code, build system, dependency manifest, test suite, or CI configuration yet.

The README states the intended purpose:

> **BettingApp** — Polymarket arb app

The goal is a Polymarket arbitrage application (identifying and/or executing arbitrage opportunities across Polymarket prediction markets). None of this is implemented — the technology stack, architecture, and tooling are all still to be decided.

## Working in this repository

Because nothing is scaffolded, there are **no build, lint, run, or test commands** to document yet. When you add the first real code:

- Establish the stack and tooling deliberately (language, package manager, test runner), then record the concrete commands here so future sessions don't have to rediscover them.
- Update this file's "Project status" section — replace this scaffold description with the actual architecture once files exist that require reading multiple files to understand.
- Polymarket integration will likely involve its public APIs (CLOB / Gamma) and on-chain interaction on Polygon; capture any API keys, endpoints, or wallet handling conventions here (referencing env vars, never committing secrets) as they are introduced.

## Git conventions

- Default branch: `main`.
- Development for the current task happens on branch `claude/claude-md-docs-7i28b6`.
