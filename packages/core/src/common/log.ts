import { getEnvUniversal } from "@/utils";
import {
	type LevelIndex,
	LevelNameMap,
	type LogLevel,
	LogLevels,
} from "./log-levels";
import {
	castToLogValue,
	formatTimestamp,
	type LogEntry,
	stringify,
} from "./logfmt";

interface LogRecord {
	args: unknown[];
	datetime: Date;
	level: number;
	levelName: string;
	loggerName: string;
	msg: string;
}

export class Logger {
	name: string;
	level: LogLevel;

	constructor(name: string, level: LogLevel) {
		this.name = name;
		this.level = level;
	}

	log(level: LevelIndex, message: string, ...args: unknown[]): void {
		const record: LogRecord = {
			msg: message,
			args,
			level,
			loggerName: this.name,
			datetime: new Date(),
			levelName: LevelNameMap[level],
		};

		if (this.#shouldLog(level)) {
			this.#logRecord(record);
		}
	}

	#shouldLog(level: LevelIndex): boolean {
		return level >= LogLevels[this.level];
	}

	#logRecord(record: LogRecord): void {
		console.log(formatter(record));
	}

	trace(message: string, ...args: unknown[]): void {
		this.log(LogLevels.TRACE, message, ...args);
	}

	debug(message: string, ...args: unknown[]): void {
		this.log(LogLevels.DEBUG, message, ...args);
	}

	info(message: string, ...args: unknown[]): void {
		this.log(LogLevels.INFO, message, ...args);
	}

	warn(message: string, ...args: unknown[]): void {
		this.log(LogLevels.WARN, message, ...args);
	}

	error(message: string, ...args: unknown[]): void {
		this.log(LogLevels.ERROR, message, ...args);
	}

	critical(message: string, ...args: unknown[]): void {
		this.log(LogLevels.CRITICAL, message, ...args);
	}
}

const loggers: Record<string, Logger> = {};

export function getLogger(name = "default"): Logger {
	const defaultLogLevelEnv: LogLevel | undefined = getEnvUniversal(
		"_LOG_LEVEL",
	) as LogLevel | undefined;

	const defaultLogLevel: LogLevel = defaultLogLevelEnv ?? "INFO";
	if (!loggers[name]) {
		loggers[name] = new Logger(name, defaultLogLevel);
	}
	return loggers[name];
}

function formatter(log: LogRecord): string {
	const args: LogEntry[] = [];
	for (let i = 0; i < log.args.length; i++) {
		const logArg = log.args[i];
		if (logArg && typeof logArg === "object") {
			// Spread object
			for (const k in logArg) {
				// biome-ignore lint/suspicious/noExplicitAny: Unknown type
				const v = (logArg as any)[k];

				pushArg(k, v, args);
			}
		} else {
			pushArg(`arg${i}`, logArg, args);
		}
	}

	const logTs = getEnvUniversal("_LOG_TIMESTAMP") === "1";
	const logTarget = getEnvUniversal("_LOG_TARGET") === "1";

	return stringify(
		...(logTs ? [["ts", formatTimestamp(new Date())] as LogEntry] : []),
		["level", LevelNameMap[log.level]],
		...(logTarget ? [["target", log.loggerName] as LogEntry] : []),
		["msg", log.msg],
		...args,
	);
}

function pushArg(k: string, v: unknown, args: LogEntry[]) {
	args.push([k, castToLogValue(v)]);
}

// function getEnv(name: string): string | undefined {
// 	if (typeof window !== "undefined" && window.localStorage) {
// 		return window.localStorage.getItem(name) || undefined;
// 	}
// 	return undefined;
// 	// TODO(ACTR-9): Add back env config once node compat layer works
// 	//return crossGetEnv(name);
// }

export function setupLogging() {
	// Do nothing for now
}
