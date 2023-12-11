import actions from "@actions/core";
import chalk from "chalk";

import PresenceCompiler from "../classes/PresenceCompiler.js";

import { basename, dirname } from "node:path";
import glob from "glob";

const compiler = new PresenceCompiler(),
	changedFolders = getDiff();

if (!changedFolders.length)
	actions.info(chalk.green("No Presences changed, exiting..."));
else {
	const errors = await compiler.compilePresence(changedFolders);

	for (const error of errors.filter(error => !error.name.includes("TS")))
		actions.error(error);

	if (errors.length)
		actions.setFailed("Some Presences failed to compile, exiting...");
}

export function getDiff(): string[] {
	const changedPresenceFolders = glob.sync("websites/*/*/metadata.json", { absolute: true })

	if (!changedPresenceFolders.length) return [];

	return [...new Set(changedPresenceFolders.map(f => basename(dirname(f))))];
}
