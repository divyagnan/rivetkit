import { openai } from "@ai-sdk/openai";
import { actor } from "@rivetkit/actor";
import { drizzle } from "@rivetkit/drizzle";
import { generateText, tool } from "ai";
import { getWeather } from "./my-utils";
import { messages } from "./schema";

export type Message = {
	role: "user" | "assistant";
	content: string;
	timestamp: number;
};

const aiAgent = actor({
	sql: drizzle(),

	actions: {
		// Get conversation history
		getMessages: async (c) => {
			const result = await c.db
				.select()
				.from(messages)
				.orderBy(messages.timestamp.asc());

			return result;
		},

		// Send a message to the AI and get a response
		sendMessage: async (c, userMessage: string) => {
			const now = Date.now();

			// Add user message to conversation
			const userMsg = {
				conversationId: c.actorId, // Use the actor instance ID
				role: "user",
				content: userMessage,
			};

			// Store user message
			await c.db.insert(messages).values(userMsg);

			// Get all messages
			const allMessages = await c.db
				.select()
				.from(messages)
				.orderBy(messages.timestamp.asc());

			// Generate AI response using Vercel AI SDK with tools
			const { text } = await generateText({
				model: openai("o3-mini"),
				prompt: userMessage,
				messages: allMessages,
				tools: {
					weather: tool({
						description: "Get the weather in a location",
						parameters: {
							location: {
								type: "string",
								description: "The location to get the weather for",
							},
						},
						execute: async ({ location }) => {
							return await getWeather(location);
						},
					}),
				},
			});

			// Add AI response to conversation
			const assistantMsg = {
				role: "assistant",
				content: text,
			};

			// Store assistant message
			await c.db.insert(messages).values(assistantMsg);

			// Broadcast the new message to all connected clients
			c.broadcast("messageReceived", assistantMsg);

			return assistantMsg;
		},
	},
});

export default aiAgent;
