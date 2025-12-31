# Dial Up Deploy Scaling Project Overview

## Current Architecture Analysis

**Technology Stack:**
- Runtime: Bun
- Language: TypeScript
- Database: SQLite (via bun:sqlite)
- Proxy: Caddy (automatic SSL)
- Architecture: Monorepo with packages (core, server, cli, actions, admin)

**Existing Infrastructure:**
- Process management with resource monitoring
- Site discovery and auto-deployment
- Admin panel (basic implementation)
- Multiple site types: static, static-build, dynamic, passthrough, docker
- Git-based deployment workflow

**Key Components:**
- `/sites` folder structure for deployments
- Database models for process tracking
- Caddy integration for SSL and routing
- CLI for management commands

## Target Transformation

**PRIMARY GOAL:** Transform into Glitch-like community hosting platform

**Core Requirements:**
1. Per-site resource limits (memory/CPU)
2. Container orchestration for production
3. Enhanced admin panel for resource management
4. Database schema for site configurations and limits
5. Local/production environment synchronization

**Success Criteria:**
- Scalable resource management per site
- Container-based isolation in production
- Admin interface for managing site limits
- Robust SQLite schema for configuration storage
- Clear sync strategy between environments

## Next Steps

This document will be expanded by the agent organizer team with detailed implementation plans.