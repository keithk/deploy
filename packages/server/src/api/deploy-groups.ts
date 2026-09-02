// ABOUTME: REST API for named deploy groups and group-wide redeploys.
// ABOUTME: Manages membership and starts every member through the normal site deploy path.

import {
  deployGroupModel,
  error,
  siteModel,
} from "@keithk/deploy-core";
import { requireAuth } from "../middleware/auth";
import {
  deployGroup,
  getGroupBuildCompatibilityError,
} from "../services/deploy-group";

export async function handleDeployGroupsApi(
  request: Request,
  path: string
): Promise<Response | null> {
  if (!path.startsWith("/api/deploy-groups")) return null;

  const authResponse = requireAuth(request);
  if (authResponse) return authResponse;

  const parts = path.split("/").filter(Boolean);
  const groupId = parts[2];

  if (request.method === "GET" && parts.length === 2) {
    return Response.json(deployGroupModel.findAll().map(toResponse));
  }

  if (request.method === "POST" && parts.length === 2) {
    const input = await readInput(request);
    if (input instanceof Response) return input;
    if (deployGroupModel.findByName(input.name)) {
      return Response.json({ error: "A deploy group with that name already exists" }, { status: 409 });
    }
    const invalidSite = input.siteIds.find((id) => !siteModel.findById(id));
    if (invalidSite) {
      return Response.json({ error: `Site not found: ${invalidSite}` }, { status: 400 });
    }
    return Response.json(toResponse(deployGroupModel.create(input.name, input.siteIds)), { status: 201 });
  }

  if (!groupId) return null;

  if (request.method === "PATCH" && parts.length === 3) {
    const existing = deployGroupModel.findById(groupId);
    if (!existing) return notFound();

    const input = await readInput(request);
    if (input instanceof Response) return input;
    const namedGroup = deployGroupModel.findByName(input.name);
    if (namedGroup && namedGroup.id !== groupId) {
      return Response.json({ error: "A deploy group with that name already exists" }, { status: 409 });
    }
    const invalidSite = input.siteIds.find((id) => !siteModel.findById(id));
    if (invalidSite) {
      return Response.json({ error: `Site not found: ${invalidSite}` }, { status: 400 });
    }
    return Response.json(toResponse(deployGroupModel.update(groupId, input)!));
  }

  if (request.method === "DELETE" && parts.length === 3) {
    return deployGroupModel.delete(groupId)
      ? new Response(null, { status: 204 })
      : notFound();
  }

  if (request.method === "POST" && parts.length === 4 && parts[3] === "deploy") {
    const group = deployGroupModel.findById(groupId);
    if (!group) return notFound();
    if (group.sites.length === 0) {
      return Response.json({ error: "Deploy group has no sites" }, { status: 400 });
    }

    const compatibilityError = getGroupBuildCompatibilityError(group);
    if (compatibilityError) {
      return Response.json({ error: compatibilityError }, { status: 400 });
    }

    void deployGroup(group).catch((err) => {
      error(`Group deployment error for ${group.name}: ${err}`);
    });

    return Response.json({
      message: "Shared group build triggered",
      group_id: group.id,
      site_ids: group.sites.map((site) => site.id),
    });
  }

  return null;
}

async function readInput(request: Request): Promise<{ name: string; siteIds: string[] } | Response> {
  try {
    const body = await request.json() as { name?: unknown; site_ids?: unknown };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return Response.json({ error: "Name is required" }, { status: 400 });
    if (!Array.isArray(body.site_ids) || !body.site_ids.every((id) => typeof id === "string")) {
      return Response.json({ error: "site_ids must be an array of site IDs" }, { status: 400 });
    }
    return { name, siteIds: [...new Set(body.site_ids)] };
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
}

function toResponse(group: ReturnType<typeof deployGroupModel.findAll>[number]) {
  return {
    id: group.id,
    name: group.name,
    created_at: group.created_at,
    sites: group.sites.map(({ id, name, status }) => ({ id, name, status })),
  };
}

function notFound(): Response {
  return Response.json({ error: "Deploy group not found" }, { status: 404 });
}
