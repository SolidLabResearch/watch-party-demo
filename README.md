# watch-party-demo
A repo for setting up and running the watch-party demo.

## Requirements:
- docker
- docker compose
- KinD
- helm
- go

## Setup Demo:
### 1. Clone (with submodules)

This repo depends on the `aggregator` service as a Git submodule (branch `stream-support`). Clone with `--recursive` to fetch it automatically:

```bash
git clone --recursive https://github.com/SolidLabResearch/watch-party-demo.git
cd watch-party-demo
```

If you already cloned without `--recursive`, initialize submodules now:

```bash
git submodule update --init --recursive
```

To pull the latest commits from the tracked submodule branch later:

```bash
git submodule update --remote --recursive
git add aggregator
git commit -m "chore: bump aggregator submodule"
```

### 2. Local development layout

Submodule path: `aggregator` (tracking branch `stream-support`). You can enter it and run normal git commands:

```bash
cd aggregator
git status
```

Switch to `main` in the future (optional):

```bash
cd aggregator
git fetch origin
git checkout main
cd ..
git config -f .gitmodules submodule.aggregator.branch main
git add .gitmodules aggregator
git commit -m "chore: switch aggregator submodule to main"
```

### 3. Build / run the Aggregator service

If the aggregator repo provides a Dockerfile:

```bash
docker build -t aggregator:dev aggregator
docker run --rm -p 5000:5000 aggregator:dev
```

Or (Go direct):

```bash
cd aggregator
go mod download
go run . --port 5000 --log-level error
```

Optional Docker Compose integration (add to `compose.yaml`):

```yaml
  aggregator:
    build: ./aggregator
    container_name: aggregator
    ports:
      - "5000:5000"
    restart: unless-stopped
```

Then:

```bash
docker compose up -d aggregator
```

### 4. Updating all submodules routinely

```bash
git pull
git submodule update --remote --recursive
git add aggregator
git commit -m "chore: update submodules"
```

### 5. Clean removal (if ever needed)

```bash
git submodule deinit -f aggregator
git rm -f aggregator
rm -rf .git/modules/aggregator
git commit -m "chore: remove aggregator submodule"
```

### 6. Quick init helper (optional)

```bash
make init # (add a Makefile target that runs 'git submodule update --init --recursive')
```

---

Proceed with the existing instructions below to start UMA servers, CSS pods, and the aggregator (now available locally under `./aggregator`). Adjust paths if you move the submodule.


## Uses
This repo composes and sets up 3 different repositories to build the demo.
- https://github.com/SolidLabResearch/solid-watch-party
- https://github.com/SolidLabResearch/aggregator
- https://github.com/SolidLabResearch/user-managed-access

# we need nodejs, yarn, unzip, git, golang

# get uma + css from https://github.com/maartyman/user-managed-access/tree/query-aggregator-evaluation
# cd into the repo
# run yarn install

# start 3 UMA servers
# port 4000, 4001, 4002
# cd into package/uma
# node ./bin/main.js --port 4000 --base-url http://localhost:4000/uma --policy-base http://localhost:3000 --log-level error

# start 3 css's
# add zip to the image
# unzip
# port 3000, 3001, 3002
# cd into package/css
# yarn run community-solid-server -m . -c ./config/default.json -a http://localhost:4000/uma -f "${./zipdata/3000}" -p 3000 -l error

# start 1 aggregator
# port 5000
# get aggregator from https://github.com/SolidLabResearch/aggregator/tree/stream-support
# cd into aggregator
# run make minikube-start
# run make containers-all
# run make minikube-generate-key-pair
# run go run . --port 5000 --log-level error --webid http://localhost:3000/alice/profile/card#me --email alice@example.org --password password

# make UI/website available
# copy dist files
# host the UI