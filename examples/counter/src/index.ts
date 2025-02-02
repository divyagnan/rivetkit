import { Manager } from "@rivet-gg/actor-manager";
import { buildManager } from "./manager";
import { logger } from "./log";
export { Actor } from "./actor";

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const manager = new Manager(buildManager(env));

		const app = manager.router;

		app.get("/actors/:actorId/:path{.+}", (c) => {
			// Reject requests that don't require upgrade
			if (c.req.header("upgrade") !== "websocket") {
				return c.text("Expected Upgrade: websocket", 426);
			}

			const actorId = c.req.param("actorId");
			const subpath = "/" + c.req.param("path");
			logger().debug("forwarding request", { actorId, subpath });

			let id = env.ACTOR_DO.idFromString(actorId);
			let stub = env.ACTOR_DO.get(id);

			// Modify the path tor emove the prefix
			//const url = new URL(request.url);
			//url.pathname = subpath;
			//const actorRequest = new Request(url.toString(), c.req.raw);

			return stub.fetch(c.req.raw);
		});

		app.all("*", (c) => {
			return c.text("Not Found (manager)", 404);
		});

		return await app.fetch(request, env, ctx);
	},
} satisfies ExportedHandler<Env>;
