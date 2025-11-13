#!/usr/bin/env -S node --experimental-specifier-resolution=node
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DemoWatchpartyGenerator } from './watchparty-demo-generator.ts';

type FlagVal = string | number | boolean | undefined;

function parseArgs(argv: string[]) {
	const out: Record<string, FlagVal> = {};
	const rest: string[] = [];
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a.startsWith('--')) {
			const [k, v] = a.slice(2).split('=');
			if (v !== undefined) out[k] = v;
			else if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) out[k] = argv[++i];
			else out[k] = true;
		} else if (a.startsWith('-')) {
			const k = a.slice(1);
			if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) out[k] = argv[++i];
			else out[k] = true;
		} else {
			rest.push(a);
		}
	}
	return { flags: out, rest };
}

function asInt(val: FlagVal, def: number): number {
	if (val === undefined) return def;
	const n = typeof val === 'number' ? val : parseInt(String(val), 10);
	return Number.isFinite(n) && n > 0 ? n : def;
}

function showHelp() {
	const help = `Watchparty demo data generator

Usage: node generator/generate.ts [options]

Options:
	--out <dir>                 Output directory (default: ./generated-data)
	--users <n>                 Total users to create (default: 5)
	--partiesPerUser <n>        How many parties each user hosts (default: 2)
	--usersPerParty <n>         Users per party including host (default: 3)
	--messagesPerUser <n>       Messages per user per party (default: 5)
	--messagesFile <path>       File with random messages (JSON array or newline-separated)
	--thumbnailsDir <path>      Directory with thumbnail images (png/jpg/jpeg/gif/webp)
	--help                      Show this help
`;
	console.log(help);
}

async function main() {
	const __filename = fileURLToPath(import.meta.url);
	const __dirname = path.dirname(__filename);
	const { flags } = parseArgs(process.argv.slice(2));
	if (flags.help) return showHelp();

	const users = asInt(flags.users, 5);
	const partiesPerUser = asInt(flags.partiesPerUser, 2);
	const usersPerParty = asInt(flags.usersPerParty, 3);
	const messagesPerUser = asInt(flags.messagesPerUser, 5);
	// experimentId flag removed: pod names will be plain user names (user1, user2, ...)

	const outBase = path.resolve(process.cwd(), 'data');
	const outDir = path.resolve(process.cwd(), String(flags.out ?? 'data'));
	fs.mkdirSync(outBase, { recursive: true });
	fs.mkdirSync(outDir, { recursive: true });

	// Defaults for assets relative to this file
	const defaultMessages = path.join(__dirname, 'assets', 'messages.txt');
	const defaultThumbs = path.join(__dirname, 'assets', 'images');

	const messagesFile = flags.messagesFile ? path.resolve(String(flags.messagesFile)) : (fs.existsSync(defaultMessages) ? defaultMessages : undefined);
	const thumbnailsDir = flags.thumbnailsDir ? path.resolve(String(flags.thumbnailsDir)) : (fs.existsSync(defaultThumbs) ? defaultThumbs : undefined);

	const generator = new DemoWatchpartyGenerator(outDir, /* experimentConfig */ {}, {
		users,
		watchPartiesPerUser: partiesPerUser,
		usersPerParty,
		messagesPerUserPerParty: messagesPerUser,
		thumbnailsDir,
		messagesFile,
	});

	const setup = generator.generate();
	// Write servers summary for compose updater
	fs.writeFileSync(path.join(outDir, 'servers.json'), JSON.stringify(setup.servers, null, 2));
	console.log('Generation complete.');
	console.log(`Query user: ${setup.queryUser.name} -> ${setup.queryUser.baseUrl}`);
	console.log('Servers:');
	for (const s of setup.servers) {
		console.log(`  - server-${s.index}: solid=${s.solidBaseUrl} uma=${s.umaBaseUrl}`);
	}
}

main().catch((err) => {
	console.error(err);
	process.exitCode = 1;
});


