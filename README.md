# watch-party-demo
A repo for setting up and running the watch-party demo.

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

## common issues:
If you already cloned without `--recursive`, initialize submodules now:

```bash
git submodule update --init --recursive
```