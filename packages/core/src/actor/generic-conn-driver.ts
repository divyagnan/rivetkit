import type { SSEStreamingApi } from "hono/streaming";
import type { WSContext } from "hono/ws";
import type { WebSocket } from "ws";
import type { AnyConn } from "@/actor/connection";
import type { ConnDriver } from "@/actor/driver";
import type { AnyActorInstance } from "@/actor/instance";
import type * as messageToClient from "@/actor/protocol/message/to-client";
import type { CachedSerializer, Encoding } from "@/actor/protocol/serde";
import { encodeDataToString } from "@/actor/protocol/serde";
import { dbg } from "@/utils";
import { logger } from "./log";

// This state is different than `PersistedConn` state since the connection-specific state is persisted & must be serializable. This is also part of the connection driver, not part of the core actor.
//
// This holds the actual connections, which are not serializable.
//
// This is scoped to each actor. Do not share between multiple actors.
export class GenericConnGlobalState {
	websockets = new Map<string, WSContext>();
	sseStreams = new Map<string, SSEStreamingApi>();
}

/**
 * Exposes connection drivers for platforms that support vanilla WebSocket, SSE, and HTTP.
 */
export function createGenericConnDrivers(
	globalState: GenericConnGlobalState,
): Record<string, ConnDriver> {
	return {
		[CONN_DRIVER_GENERIC_WEBSOCKET]: createGenericWebSocketDriver(globalState),
		[CONN_DRIVER_GENERIC_SSE]: createGenericSseDriver(globalState),
		[CONN_DRIVER_GENERIC_HTTP]: createGeneircHttpDriver(),
	};
}

// MARK: WebSocket
export const CONN_DRIVER_GENERIC_WEBSOCKET = "genericWebSocket";

export interface GenericWebSocketDriverState {
	encoding: Encoding;
}

export function createGenericWebSocketDriver(
	globalState: GenericConnGlobalState,
): ConnDriver<GenericWebSocketDriverState> {
	return {
		sendMessage: (
			actor: AnyActorInstance,
			conn: AnyConn,
			state: GenericWebSocketDriverState,
			message: CachedSerializer<messageToClient.ToClient>,
		) => {
			const ws = globalState.websockets.get(conn.id);
			if (!ws) {
				logger().warn("missing ws for sendMessage", {
					actorId: actor.id,
					connId: conn.id,
					totalCount: globalState.websockets.size,
				});
				return;
			}

			const serialized = message.serialize(state.encoding);

			logger().debug("sending websocket message", {
				encoding: state.encoding,
				dataType: typeof serialized,
				isUint8Array: serialized instanceof Uint8Array,
				isArrayBuffer: serialized instanceof ArrayBuffer,
				dataLength:
					(serialized as any).byteLength || (serialized as any).length,
			});

			// Convert Uint8Array to ArrayBuffer for proper transmission
			if (serialized instanceof Uint8Array) {
				const buffer = serialized.buffer.slice(
					serialized.byteOffset,
					serialized.byteOffset + serialized.byteLength,
				);
				// Handle SharedArrayBuffer case
				if (buffer instanceof SharedArrayBuffer) {
					const arrayBuffer = new ArrayBuffer(buffer.byteLength);
					new Uint8Array(arrayBuffer).set(new Uint8Array(buffer));
					logger().debug("converted SharedArrayBuffer to ArrayBuffer", {
						byteLength: arrayBuffer.byteLength,
					});
					ws.send(arrayBuffer);
				} else {
					logger().debug("sending ArrayBuffer", {
						byteLength: buffer.byteLength,
					});
					ws.send(buffer);
				}
			} else {
				logger().debug("sending string data", {
					length: (serialized as string).length,
				});
				ws.send(serialized);
			}
		},

		disconnect: async (
			actor: AnyActorInstance,
			conn: AnyConn,
			_state: GenericWebSocketDriverState,
			reason?: string,
		) => {
			const ws = globalState.websockets.get(conn.id);
			if (!ws) {
				logger().warn("missing ws for disconnect", {
					actorId: actor.id,
					connId: conn.id,
					totalCount: globalState.websockets.size,
				});
				return;
			}

			const raw = ws.raw as WebSocket;
			if (!raw) {
				logger().warn("ws.raw does not exist");
				return;
			}

			// Create promise to wait for socket to close gracefully
			const { promise, resolve } = Promise.withResolvers<void>();
			raw.addEventListener("close", () => resolve());

			// Close socket
			ws.close(1000, reason);

			await promise;
		},
	};
}

// MARK: SSE
export const CONN_DRIVER_GENERIC_SSE = "genericSse";

export interface GenericSseDriverState {
	encoding: Encoding;
}

export function createGenericSseDriver(globalState: GenericConnGlobalState) {
	return {
		sendMessage: (
			_actor: AnyActorInstance,
			conn: AnyConn,
			state: GenericSseDriverState,
			message: CachedSerializer<messageToClient.ToClient>,
		) => {
			const stream = globalState.sseStreams.get(conn.id);
			if (!stream) {
				logger().warn("missing sse stream for sendMessage", {
					connId: conn.id,
				});
				return;
			}
			stream.writeSSE({
				data: encodeDataToString(message.serialize(state.encoding)),
			});
		},

		disconnect: async (
			_actor: AnyActorInstance,
			conn: AnyConn,
			_state: GenericSseDriverState,
			_reason?: string,
		) => {
			const stream = globalState.sseStreams.get(conn.id);
			if (!stream) {
				logger().warn("missing sse stream for disconnect", { connId: conn.id });
				return;
			}

			stream.close();
		},
	};
}

// MARK: HTTP
export const CONN_DRIVER_GENERIC_HTTP = "genericHttp";

export type GenericHttpDriverState = Record<never, never>;

export function createGeneircHttpDriver() {
	return {
		disconnect: async () => {
			// Noop
		},
	};
}
