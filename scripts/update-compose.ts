import * as fs from 'node:fs';
import * as path from 'node:path';
import yaml from 'js-yaml';

interface ServerInfo {
  index: number;
  solidPort: number;
  umaPort: number;
  relativePath: string;
  absolutePath: string;
  solidBaseUrl: string;
  umaBaseUrl: string;
}

function ensure<T>(v: any, fallback: T): T {
  return v ?? fallback;
}

export function updateCompose(composePath: string, dataDir: string) {
  const composeRaw = fs.readFileSync(composePath, 'utf8');
  const compose: any = yaml.load(composeRaw) ?? {};

  compose.version = compose.version || '3.9';
  compose.services = ensure(compose.services, {});

  // Ensure UI service exists so loopbacks can be added for every CSS container
  if (!compose.services.ui) {
    compose.services.ui = {
      image: 'maartyman/watch-party-ui:v1.0.1',
      ports: [ '8080:8080' ],
      depends_on: [ 'css1' ],
    };
  }

  // Load servers
  const serversPath = path.join(dataDir, 'servers.json');
  if (!fs.existsSync(serversPath)) {
    throw new Error(`servers.json not found in ${dataDir}. Run the generator first.`);
  }
  const servers: ServerInfo[] = JSON.parse(fs.readFileSync(serversPath, 'utf8'));

  // Add/replace UMA and CSS services for each server
  for (const s of servers) {
    const umaName = `uma${s.index + 1}`;
    const cssName = `css${s.index + 1}`;

    // Core services
    compose.services[umaName] = {
      image: 'maartyman/uma:v1',
      environment: {
        BASE_URL: `http://localhost:${s.umaPort}/uma`,
        POLICY_BASE: `http://localhost:${s.solidPort}`,
        LOG_LEVEL: 'error',
      },
      ports: [`${s.umaPort}:${s.umaPort}`],
    };

    compose.services[cssName] = {
      image: 'maartyman/css:v1',
      environment: {
        UMA_BASE: `http://localhost:${s.umaPort}/`,
        DATA_DIR: '/data',
        LOG_LEVEL: 'error',
      },
      volumes: [ `./data/server-${s.index}:/data` ],
      ports: [ `${s.solidPort}:${s.solidPort}` ],
      depends_on: [ umaName ],
    };

    // Loopback proxies so services can reach each other via localhost
    // Forward 127.0.0.1:UMA_PORT inside CSS namespace -> uma:UMA_PORT
    compose.services[`${umaName}_loopback`] = {
      image: 'alpine/socat',
      network_mode: `service:${cssName}`,
      depends_on: [ umaName, cssName ],
      command: [
        'tcp-listen:' + s.umaPort + ',fork,reuseaddr,bind=127.0.0.1',
        'tcp-connect:' + umaName + ':' + s.umaPort,
      ].join('\n'),
    };

    // Forward 127.0.0.1:SOLID_PORT inside UMA namespace -> css:SOLID_PORT
    compose.services[`${cssName}_loopback`] = {
      image: 'alpine/socat',
      network_mode: `service:${umaName}`,
      depends_on: [ cssName, umaName ],
      command: [
        'tcp-listen:' + s.solidPort + ',fork,reuseaddr,bind=127.0.0.1',
        'tcp-connect:' + cssName + ':' + s.solidPort,
      ].join('\n'),
    };

    // Forward host aggregator into CSS namespace at localhost:5000
    compose.services[`aggregator_loopback_in_${cssName}`] = {
      image: 'alpine/socat',
      network_mode: `service:${cssName}`,
      depends_on: [ cssName ],
      command: [
        'tcp-listen:5000,fork,reuseaddr,bind=127.0.0.1',
        'tcp-connect:${HOST_GATEWAY_IP:-172.17.0.1}:5000',
      ].join('\n'),
    };

    // Forward host aggregator into UMA namespace at localhost:5000
    compose.services[`aggregator_loopback_in_${umaName}`] = {
      image: 'alpine/socat',
      network_mode: `service:${umaName}`,
      depends_on: [ umaName ],
      command: [
        'tcp-listen:5000,fork,reuseaddr,bind=127.0.0.1',
        'tcp-connect:${HOST_GATEWAY_IP:-172.17.0.1}:5000',
      ].join('\n'),
    };

    // If a UI service exists, expose it on localhost:8080 inside each CSS container too
    if (compose.services.ui) {
      compose.services[`ui_loopback_${cssName}`] = {
        image: 'alpine/socat',
        network_mode: `service:${cssName}`,
        depends_on: [ 'ui', cssName ],
        command: [
          'tcp-listen:8080,fork,reuseaddr,bind=127.0.0.1',
          'tcp-connect:ui:8080',
        ].join('\n'),
      };
    }
  }

  // Update aggregator depends_on to include all CSS services
  if (compose.services.aggregator) {
    const cssDeps = servers.map((s) => `css${s.index + 1}`);
    compose.services.aggregator.depends_on = cssDeps;
  }

  fs.writeFileSync(composePath, yaml.dump(compose, { noRefs: true, lineWidth: 120 }));
}

// ESM entry point detection
if (import.meta.url === `file://${process.argv[1]}`) {
  const composePath = process.argv[2] || path.resolve(process.cwd(), 'compose.yaml');
  const dataDir = process.argv[3] || path.resolve(process.cwd(), 'data');
  updateCompose(composePath, dataDir);
  console.log(`compose.yaml updated with ${path.relative(process.cwd(), dataDir)} servers.`);
}
