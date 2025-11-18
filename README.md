# watch-party-demo
A repo for setting up and running the watch-party demo.

[![Watch the video]](https://vimeo.com/1138085565?share=copy&fl=sv&fe=ci)

## Requirements:
- docker
- docker compose
- KinD
- helm
- go

## Setup Demo:
This repo depends on the `aggregator` service as a Git submodule (branch `stream-support`). Clone with `--recursive` to fetch it automatically:

```bash
git clone --recursive https://github.com/SolidLabResearch/watch-party-demo.git
cd watch-party-demo
```

Initiate the kubernettes cluster for the aggregator
```bash
cd aggregator/ && make kubernettes-init
```

Start the servers
```bash
npm run start
```

Demo should be available at http://localhost:8080/

## Uses
This repo composes and sets up 3 different repositories to build the demo.
- https://github.com/SolidLabResearch/solid-watch-party
- https://github.com/SolidLabResearch/aggregator
- https://github.com/SolidLabResearch/user-managed-access

# Data generator

The generator builds a complete Solid watch‑party dataset under an output folder (default: `./data`). It creates:
- User profiles (`…/profile/card$.ttl`)
- Rooms per host (`…/watchparties/myRooms/<room-id>/room$.ttl` and `register$.ttl`)
- Per‑user message outboxes with synthetic messages (`…/watchparties/myMessages/MSG…$.ttl`)
- Optional room thumbnails if you provide an images folder
- A random YouTube trailer per room wired as a `schema:VideoObject` featured by an event, plus a paused `schema:SuspendAction` at location `"0"`
- `servers.json` with ports/URLs to help wire Docker Compose

Run it like this:

```bash
npm run generate -- --users 15 --partiesPerUser 1 --usersPerParty 15 --messagesPerUser 20
```

Flags (all optional unless noted):
- `--users <n>`
	- Total number of users to create (default: 5)
- `--partiesPerUser <n>`
	- How many parties each user hosts (default: 2)
- `--usersPerParty <n>`
	- Total users per party including the host; participants are selected round‑robin (default: 3)
- `--messagesPerUser <n>`
	- Messages each participating user posts per party into their outbox (default: 5)
- `--out <dir>`
	- Output directory for generated data (default: `./data`)
- `--messagesFile <path>`
	- Optional path to a text file for message content; accepts either a JSON array of strings or newline‑separated text. A convenient default lives at `generator/assets/messages.txt`.
- `--thumbnailsDir <path>`
	- Optional path to a folder with images (png/jpg/jpeg/gif/webp). One image may be copied as the room thumbnail; its base filename is also used as the room’s semantic name.
- `--help`
	- Prints the generator help and exits.

### Validate trailers (optional)

We keep trailer links in `generator/assets/videos.txt`. You can validate and refresh this file with the trailer validator, which checks titles via YouTube oEmbed:

```bash
npm run -s trailers
```

What it does:
- Fetches each URL’s title via oEmbed and verifies expected keywords.
- Writes valid URLs (one per line) to `generator/assets/videos.txt`.
- Prints any invalid URLs to stdout so you can review/replace them.

### Generate compose from data (optional)

After running the data generator, you can update `compose.yaml` based on `data/servers.json` so all CSS/UMA instances are wired correctly and can talk via localhost. It also forwards `localhost:5000` inside each container to the aggregator on your host.

```bash
node --loader ts-node/esm scripts/update-compose.ts compose.yaml data
```


## common issues:
If you already cloned without `--recursive`, initialize submodules now:

```bash
git submodule update --init --recursive
```
