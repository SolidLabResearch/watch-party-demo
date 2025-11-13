import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { WatchpartyDataGenerator } from './temp/generate-data-watchparty.ts';
import type { ExperimentSetup, PodContext } from './temp/data-generator.ts';

export interface DemoGeneratorOptions {
  users: number; // total number of users to create
  watchPartiesPerUser: number; // how many parties each user hosts
  usersPerParty: number; // total users in a party (including host)
  messagesPerUserPerParty: number; // how many messages each participating user posts per party
  // experimentId removed: pod names will be plain user names (user1, user2, ...)
  thumbnailsDir?: string; // optional path to folder with images
  messagesFile?: string; // optional path to file with random messages (json array or newline-separated)
}

function ensureDir(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function pickRandom<T>(arr: T[]): T | undefined {
  if (!arr || arr.length === 0) return undefined;
  const idx = Math.floor(Math.random() * arr.length);
  return arr[idx];
}

function loadMessages(messagesFile?: string): string[] {
  if (!messagesFile) return [];
  if (!fs.existsSync(messagesFile)) return [];
  const raw = fs.readFileSync(messagesFile, 'utf8').trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map(String).filter(Boolean);
    }
  } catch {
    // fall back to newline separated
  }
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

function listImages(thumbnailsDir?: string): string[] {
  if (!thumbnailsDir) return [];
  if (!fs.existsSync(thumbnailsDir)) return [];
  const exts = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);
  return fs
    .readdirSync(thumbnailsDir)
    .filter((f) => exts.has(path.extname(f).toLowerCase()))
    .map((f) => path.join(thumbnailsDir, f));
}

function loadVideos(): string[] {
  // videos.txt is in assets/videos.txt relative to this file
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const videoPath = path.join(__dirname, 'assets', 'videos.txt');
    if (!fs.existsSync(videoPath)) return [];
    const raw = fs.readFileSync(videoPath, 'utf8');
    return raw
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l.length > 0 && /^https?:\/\//.test(l));
  } catch {
    return [];
  }
}

export class DemoWatchpartyGenerator extends WatchpartyDataGenerator {
  private readonly opts: DemoGeneratorOptions;
  private readonly messages: string[];
  private readonly images: string[];
  private readonly outDir: string;
  private readonly videos: string[];

  constructor(outputDirectory: string, experimentConfig: any, opts: DemoGeneratorOptions) {
    super(outputDirectory, experimentConfig);
    this.opts = opts;
    this.messages = loadMessages(opts.messagesFile);
    this.images = listImages(opts.thumbnailsDir);
    this.outDir = outputDirectory;
    this.videos = loadVideos();
  }

  public generate(): ExperimentSetup {
    (this as any).removeGeneratedData();

    const { users, watchPartiesPerUser, usersPerParty, messagesPerUserPerParty } = this.opts;
    // Create all user profile cards first
    const userContexts: PodContext[] = [];
    for (let i = 1; i <= users; i++) {
      const userId = `user${i}`;
      const userCtx = this.getUserPodContext(userId);
      userContexts.push(userCtx);
      this.writeProfileCard(userCtx, `User ${i}`);
    }

    // For each host, create their parties
    for (let i = 1; i <= users; i++) {
      const host = userContexts[i - 1];
      for (let p = 1; p <= watchPartiesPerUser; p++) {
        const roomId = `room-${host.name}-${p}`;

        // Determine participants: include the host and the next N-1 users (wrap-around)
        const participants: PodContext[] = [host];
        const neededOthers = Math.max(0, Math.min(usersPerParty - 1, users - 1));
        for (let k = 1; k <= neededOthers; k++) {
          const idx = (i - 1 + k) % users; // wrap around
          participants.push(userContexts[idx]);
        }

        // Create message boxes for each participant, with messages
        for (const participant of participants) {
          this.writeMessageBoxWithMessages(participant, host, roomId, messagesPerUserPerParty);
        }

        // Create the room at the host
        this.writeRoom(host, roomId, participants);

        // Create the register file at the host (one RegisterAction per participant)
        this.writeRegister(host, roomId, participants);
      }
    }

    const queryUser = userContexts[0];
    return (this as any).finalizeGeneration(queryUser);
  }

  private writeProfileCard(userCtx: PodContext, displayName: string) {
    const baseUrl = userCtx.baseUrl;
    const ttl = `@prefix foaf: <http://xmlns.com/foaf/0.1/>.
@prefix solid: <http://www.w3.org/ns/solid/terms#>.
@prefix schema: <http://schema.org/>.

<>
    a foaf:PersonalProfileDocument;
    foaf:maker <${baseUrl}/profile/card#me>;
    foaf:primaryTopic <${baseUrl}/profile/card#me>.

<${baseUrl}/profile/card#me>
    solid:oidcIssuer <${userCtx.server.solidBaseUrl}>;
    a foaf:Person, schema:Person;
    foaf:name "${displayName.replace(/"/g, '\\"')}";
    schema:name "${displayName.replace(/"/g, '\\"')}" .
`;
  const filePath = path.join(this.outDir, userCtx.relativePath, 'profile', 'card$.ttl');
    ensureDir(filePath);
    fs.writeFileSync(filePath, ttl);
  }

  private writeRoom(hostCtx: PodContext, roomId: string, participants: PodContext[]) {
    const startDate = new Date(Date.now() + Math.floor(Math.random() * 10000000000)).toISOString();
    const hostUrl = hostCtx.baseUrl;

    // Build attendees and subjectOf lists
    const attendeeTriples = participants
      .map((p) => `        <${p.baseUrl}/profile/card#me>`) // indent aligns with formatting below
      .join(',\n');

    const subjectOfTriples = participants
      .map((p) => `        <${p.baseUrl}/watchparties/myMessages/${this.computeMessageBoxId(hostCtx, roomId)}#outbox>`)
      .join(',\n');

    // Optional thumbnail; also use the original image file name (without extension) as the semantic room name if available
    const thumbnail = pickRandom(this.images);
    let imageTriple = '';
    let copiedThumbUrl: string | undefined;
    let semanticRoomName = `Room ${roomId}`;
    if (thumbnail) {
      const ext = path.extname(thumbnail) || '.png';
      const originalName = path.basename(thumbnail, ext);
      semanticRoomName = originalName; // use image base name (no extension) for schema:name
      const roomDir = path.join(this.outDir, hostCtx.relativePath, 'watchparties', 'myRooms', roomId);
      const targetName = `thumbnail${ext.toLowerCase()}`;
      const targetPath = path.join(roomDir, targetName);
      fs.mkdirSync(roomDir, { recursive: true });
      fs.copyFileSync(thumbnail, targetPath);
      copiedThumbUrl = `${hostUrl}/watchparties/myRooms/${roomId}/${targetName}`;
      imageTriple = `\n    <http://schema.org/image> <${copiedThumbUrl}> ;`;
    }

  let ttl = `<#${roomId}> a <http://schema.org/EventSeries>;
    <http://schema.org/description> "Solid Watchparty";
    <http://schema.org/name> "${semanticRoomName.replace(/"/g, '\\"')}";
    <http://schema.org/organizer> <${hostUrl}/profile/card#me>;
    <http://schema.org/startDate> "${startDate}"^^<http://www.w3.org/2001/XMLSchema#dateTime>;
    <http://schema.org/attendee>\n${attendeeTriples};${imageTriple}
    <http://schema.org/subjectOf>\n${subjectOfTriples}.
`;

  // Append random video + event + pause control (SuspendAction) if we have videos.
  const videoUrl = pickRandom(this.videos);
  if (videoUrl) {
    // Use random UUID-like fragments for uniqueness
    const videoId = this.randomFragmentId();
    const eventId = this.randomFragmentId();
    const controlId = this.randomFragmentId();
    const eventStart = new Date().toISOString();
    const controlStart = new Date(Date.now() + 10000).toISOString(); // 10s later
    ttl += `
<#${videoId}> a <http://schema.org/VideoObject>;
  <http://schema.org/contentUrl> <${videoUrl}>.
<#${eventId}> a <http://schema.org/Event>;
  <http://schema.org/startDate> "${eventStart}"^^<http://www.w3.org/2001/XMLSchema#dateTime>;
  <http://schema.org/workFeatured> <#${videoId}>;
  <http://schema.org/ControlAction> <#${controlId}>.
<#${controlId}> a <http://schema.org/SuspendAction>, <http://schema.org/ControlAction>;
  <http://schema.org/location> "0";  # paused position at start
  <http://schema.org/agent> <${hostUrl}/profile/card#me>;
  <http://schema.org/object> <#${eventId}>;
  <http://schema.org/startTime> "${controlStart}"^^<http://www.w3.org/2001/XMLSchema#dateTime>.
`;
  }

  const filePath = path.join(this.outDir, hostCtx.relativePath, 'watchparties', 'myRooms', roomId, 'room$.ttl');
    ensureDir(filePath);
    fs.writeFileSync(filePath, ttl);
  }

  private writeMessageBoxWithMessages(
    participantCtx: PodContext,
    hostCtx: PodContext,
    roomId: string,
    messagesPerUser: number,
  ) {
    const participantUrl = participantCtx.baseUrl;
    const hostRoomUrl = `${hostCtx.baseUrl}/watchparties/myRooms/${roomId}/room#${roomId}`;
    const mbId = this.computeMessageBoxId(hostCtx, roomId);

    // Build message URIs list and message bodies
    const messageIds: string[] = [];
    let messagesTtl = '';
    for (let j = 1; j <= messagesPerUser; j++) {
      const mid = `message-${participantCtx.name}-${j}`;
      messageIds.push(mid);
      const date = new Date(Date.now() + Math.floor(Math.random() * 10000000000)).toISOString();
      const text = this.pickMessageText(j, participantCtx.name);
      messagesTtl += `\n<#${mid}> a <http://schema.org/Message>;
    <http://schema.org/sender> <${participantUrl}/profile/card#me>;
    <http://schema.org/isPartOf> <#outbox>;
    <http://schema.org/dateSent> "${date}"^^<http://www.w3.org/2001/XMLSchema#dateTime>;
    <http://schema.org/text> ${text} .`;
    }

    let outboxTtl = `<#outbox> a <http://schema.org/CreativeWorkSeries>;
    <http://schema.org/about> <${hostRoomUrl}>;
    <http://schema.org/creator> <${participantUrl}/profile/card#me>`;
    if (messageIds.length > 0) {
      const hasPartList = messageIds
        .map((id) => `        <#${id}>`)
        .join(',\n');
      outboxTtl += `;
    <http://schema.org/hasPart>\n${hasPartList}.`;
    } else {
      outboxTtl += `.`;
    }

    const ttl = `${outboxTtl}${messagesTtl}\n`;
    const filePath = path.join(this.outDir, participantCtx.relativePath, 'watchparties', 'myMessages', `${mbId}$.ttl`);
    ensureDir(filePath);
    fs.writeFileSync(filePath, ttl);
  }

  private pickMessageText(index: number, userName: string): string {
  const txt = pickRandom(this.messages) ?? `Message ${index} from ${userName}`;
    // escape quotes, wrap in quotes
    return `"${txt.replace(/"/g, '\\"')}"`;
  }

  private writeRegister(hostCtx: PodContext, roomId: string, participants: PodContext[]) {
    const roomIri = `${hostCtx.baseUrl}/watchparties/myRooms/${roomId}/room#${roomId}`;
    const mbId = this.computeMessageBoxId(hostCtx, roomId);
    let ttl = '';
    for (const p of participants) {
      const agent = `${p.baseUrl}/profile/card#me`;
      const idFrag = this.encodeUrlForFragment(agent);
      const messageBoxOutbox = `${p.baseUrl}/watchparties/myMessages/${mbId}#outbox`;
      ttl += `
<#${idFrag}> a <http://schema.org/RegisterAction>;
    <http://schema.org/agent> <${agent}>;
    <http://schema.org/object> <${roomIri}>;
    <http://schema.org/additionalType> <${messageBoxOutbox}>;
    <http://schema.org/actionStatus> <http://schema.org/CompletedActionStatus>.
`;
    }
    const filePath = path.join(this.outDir, hostCtx.relativePath, 'watchparties', 'myRooms', roomId, 'register$.ttl');
    ensureDir(filePath);
    fs.writeFileSync(filePath, ttl.trimStart() + '\n');
  }

  private encodeUrlForFragment(url: string): string {
    // mimic simple flattening like the example: remove protocol markers and punctuation
    return url.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
  }

  private computeMessageBoxId(hostCtx: PodContext, roomId: string): string {
    const roomUrl = `${hostCtx.baseUrl}/watchparties/myRooms/${roomId}/room#${roomId}`;
    // Follow example: MSG + flattened room URL (remove non-alphanumeric)
    return `MSG${this.encodeUrlForFragment(roomUrl)}`;
  }

  private randomFragmentId(): string {
    return randomUUID();
  }
}
