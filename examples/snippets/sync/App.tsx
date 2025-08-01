import { createClient } from "@rivetkit/actor/client";
import { createReactRivetKit } from "@rivetkit/react";
import { useEffect, useRef, useState } from "react";
import type { Contact } from "./actor";

const client = createClient("http://localhost:8080");
const { useActor, useActorEvent } = createReactRivetKit(client);

export function ContactsApp() {
	const { actor } = useActor("contacts");
	const [contacts, setContacts] = useState<Contact[]>([]);
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [phone, setPhone] = useState("");
	const [syncStatus, setSyncStatus] = useState("Idle");

	const lastSyncTime = useRef(0);

	// Load initial contacts
	useEffect(() => {
		if (!actor) return;

		actor.getChanges(0).then((data) => {
			setContacts(data.changes);
			lastSyncTime.current = data.timestamp;
			setSyncStatus("Synced");
		});
	}, [actor]);

	// Handle contact events
	useActorEvent(
		{ actor, event: "contactsChanged" },
		({ contacts: updatedContacts }) => {
			setContacts((prev) => {
				const contactMap = new Map(prev.map((c) => [c.id, c]));

				updatedContacts.forEach((contact) => {
					const existing = contactMap.get(contact.id);
					if (!existing || existing.updatedAt < contact.updatedAt) {
						contactMap.set(contact.id, contact);
					}
				});

				return Array.from(contactMap.values());
			});
		},
	);

	// Sync periodically
	useEffect(() => {
		if (!actor) return;

		const sync = async () => {
			setSyncStatus("Syncing...");

			try {
				// Get remote changes
				const changes = await actor.getChanges(lastSyncTime.current);

				// Apply remote changes
				if (changes.changes.length > 0) {
					setContacts((prev) => {
						const contactMap = new Map(prev.map((c) => [c.id, c]));

						changes.changes.forEach((contact) => {
							const existing = contactMap.get(contact.id);
							if (!existing || existing.updatedAt < contact.updatedAt) {
								contactMap.set(contact.id, contact);
							}
						});

						return Array.from(contactMap.values());
					});
				}

				// Push local changes
				const localChanges = contacts.filter(
					(c) => c.updatedAt > lastSyncTime.current,
				);
				if (localChanges.length > 0) {
					await actor.pushChanges(localChanges);
				}

				lastSyncTime.current = changes.timestamp;
				setSyncStatus("Synced");
			} catch (error) {
				setSyncStatus("Offline");
			}
		};

		const intervalId = setInterval(sync, 5000);

		return () => clearInterval(intervalId);
	}, [actor, contacts]);

	// Add new contact (local first)
	const addContact = () => {
		if (!name.trim()) return;

		const newContact: Contact = {
			id: Date.now().toString(),
			name,
			email,
			phone,
			updatedAt: Date.now(),
		};

		setContacts((prev) => [...prev, newContact]);

		if (actor) {
			actor.pushChanges([newContact]);
		}

		setName("");
		setEmail("");
		setPhone("");
	};

	// Delete contact (implemented as update with empty name)
	const deleteContact = (id: string) => {
		setContacts((prev) => {
			const updatedContacts = prev.map((c) =>
				c.id === id ? { ...c, name: "", updatedAt: Date.now() } : c,
			);

			if (actor) {
				const deleted = updatedContacts.find((c) => c.id === id);
				if (deleted) {
					actor.pushChanges([deleted]);
				}
			}

			return updatedContacts.filter((c) => c.name !== "");
		});
	};

	// Manual sync
	const handleSync = async () => {
		if (!actor) return;

		setSyncStatus("Syncing...");

		try {
			// Push all contacts
			await actor.pushChanges(contacts);

			// Get all changes
			const changes = await actor.getChanges(0);

			setContacts(changes.changes);
			lastSyncTime.current = changes.timestamp;
			setSyncStatus("Synced");
		} catch (error) {
			setSyncStatus("Offline");
		}
	};

	return (
		<div className="contacts-app">
			<div className="contacts-header">
				<h2>Contacts</h2>
				<div className="sync-status">
					<span>{syncStatus}</span>
					<button onClick={handleSync}>Sync Now</button>
				</div>
			</div>

			<div className="add-contact">
				<input
					type="text"
					placeholder="Name"
					value={name}
					onChange={(e) => setName(e.target.value)}
				/>
				<input
					type="email"
					placeholder="Email"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
				/>
				<input
					type="tel"
					placeholder="Phone"
					value={phone}
					onChange={(e) => setPhone(e.target.value)}
				/>
				<button onClick={addContact}>Add Contact</button>
			</div>

			<div className="contacts-list">
				{contacts
					.filter((c) => c.name !== "")
					.map((contact) => (
						<div key={contact.id} className="contact-item">
							<div className="contact-info">
								<div className="contact-name">{contact.name}</div>
								<div className="contact-details">
									<div>{contact.email}</div>
									<div>{contact.phone}</div>
								</div>
							</div>
							<button
								className="delete-button"
								onClick={() => deleteContact(contact.id)}
							>
								Delete
							</button>
						</div>
					))}
			</div>
		</div>
	);
}
