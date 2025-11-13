#!/usr/bin/env -S ts-node --esm
/**
 * Validate a curated list of famous movie trailer YouTube links using YouTube oEmbed
 * and write valid URLs to generator/assets/videos.txt. Print invalid URLs to stdout
 * (one per line).
 */

import { writeFile } from 'node:fs/promises';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

interface Trailer {
  name: string;
  url: string;
  expectedKeywords: string[]; // expected to be present in title (case-insensitive)
}

const TRAILERS: readonly Trailer[] = [
  // Modern blockbusters
  { name: 'The Dark Knight (2008)', url: 'https://www.youtube.com/watch?v=EXeTwQWrcwY', expectedKeywords: ['dark knight', 'trailer'] },
  { name: 'Inception (2010)', url: 'https://www.youtube.com/watch?v=YoHD9XEInc0', expectedKeywords: ['inception', 'trailer'] },
  { name: 'Avengers: Endgame (2019)', url: 'https://www.youtube.com/watch?v=TcMBFSGVi1c', expectedKeywords: ['endgame', 'trailer'] },
  { name: 'Avatar (2009)', url: 'https://www.youtube.com/watch?v=5PSNL1qE6VY', expectedKeywords: ['avatar', 'trailer'] },
  { name: 'Interstellar (2014)', url: 'https://www.youtube.com/watch?v=zSWdZVtXT7E', expectedKeywords: ['interstellar', 'trailer'] },
  { name: 'Star Wars: The Force Awakens (2015)', url: 'https://www.youtube.com/watch?v=sGbxmsDFVnE', expectedKeywords: ['force awakens', 'trailer'] },
  { name: 'Mad Max: Fury Road (2015)', url: 'https://www.youtube.com/watch?v=hEJnMQG9ev8', expectedKeywords: ['fury road', 'trailer'] },

  // 90s-2000s classics
  { name: 'The Matrix (1999)', url: 'https://www.youtube.com/watch?v=vKQi3bBA1y8', expectedKeywords: ['matrix', 'trailer'] },
  { name: 'Titanic (1997)', url: 'https://www.youtube.com/watch?v=kVrqfYjkTdQ', expectedKeywords: ['titanic', 'trailer'] },
  { name: 'Gladiator (2000)', url: 'https://www.youtube.com/watch?v=owK1qxDselE', expectedKeywords: ['gladiator', 'trailer'] },
  { name: 'LOTR: The Fellowship of the Ring (2001)', url: 'https://www.youtube.com/watch?v=V75dMMIW2B4', expectedKeywords: ['fellowship', 'trailer'] },
  { name: 'The Avengers (2012)', url: 'https://www.youtube.com/watch?v=eOrNdBpGMv8', expectedKeywords: ['avengers', 'trailer'] },

  // All-time greats
  { name: 'The Godfather (1972)', url: 'https://www.youtube.com/watch?v=sY1S34973zA', expectedKeywords: ['godfather', 'trailer'] },
  { name: 'Pulp Fiction (1994)', url: 'https://www.youtube.com/watch?v=s7EdQ4FqbhY', expectedKeywords: ['pulp fiction', 'trailer'] },
  { name: 'The Shawshank Redemption (1994)', url: 'https://www.youtube.com/watch?v=NmzuHjWmXOc', expectedKeywords: ['shawshank', 'trailer'] },
  { name: 'Fight Club (1999)', url: 'https://www.youtube.com/watch?v=SUXWAEX2jlg', expectedKeywords: ['fight club', 'trailer'] },
  { name: 'Back to the Future (1985)', url: 'https://www.youtube.com/watch?v=qvsgGtivCgs', expectedKeywords: ['back to the future', 'trailer'] },
  { name: 'Jurassic Park (1993)', url: 'https://www.youtube.com/watch?v=QWBKEmWWL38', expectedKeywords: ['jurassic', 'trailer'] },
  { name: 'Raiders of the Lost Ark (1981)', url: 'https://www.youtube.com/watch?v=XkkzKHCx154', expectedKeywords: ['raiders', 'trailer'] },
  { name: 'Jaws (1975)', url: 'https://www.youtube.com/watch?v=U1fu_sA7XhE', expectedKeywords: ['jaws', 'trailer'] },
  { name: 'Psycho (1960)', url: 'https://www.youtube.com/watch?v=Wz719b9QUqY', expectedKeywords: ['psycho', 'trailer'] },
  { name: 'Alien (1979)', url: 'https://www.youtube.com/watch?v=LjLamj-b0I8', expectedKeywords: ['alien', 'trailer'] },
  { name: 'Terminator 2: Judgment Day (1991)', url: 'https://www.youtube.com/watch?v=CRRlbK5w8AE', expectedKeywords: ['terminator 2', 'trailer'] },
  { name: 'The Silence of the Lambs (1991)', url: 'https://www.youtube.com/watch?v=W6Mm8Sbe__o', expectedKeywords: ['silence of the lambs', 'trailer'] },

  // Animation
  { name: 'The Lion King (1994)', url: 'https://www.youtube.com/watch?v=lFzVJEksoDY', expectedKeywords: ['lion king', 'trailer'] },

  // A few more recent hits
  { name: 'Dune: Part Two (2024)', url: 'https://www.youtube.com/watch?v=U2Qp5pL3ovA', expectedKeywords: ['dune', 'trailer'] },
  { name: 'Oppenheimer (2023)', url: 'https://www.youtube.com/watch?v=bK6ldnjE3Y0', expectedKeywords: ['oppenheimer', 'trailer'] },
  { name: 'Barbie (2023)', url: 'https://www.youtube.com/watch?v=pBk4NYhWNMM', expectedKeywords: ['barbie', 'trailer'] },
  { name: 'The Batman (2022)', url: 'https://www.youtube.com/watch?v=mqqft2x_Aa4', expectedKeywords: ['the batman', 'trailer'] },
  { name: 'Spider-Man: No Way Home (2021)', url: 'https://www.youtube.com/watch?v=JfVOs4VSpmA', expectedKeywords: ['no way home', 'trailer'] },
];

const OUTPUT_FILE = 'generator/assets/videos.txt';

async function fetchOEmbedTitle(url: string, signal?: AbortSignal): Promise<string | null> {
  const oembed = new URL('https://www.youtube.com/oembed');
  oembed.searchParams.set('url', url);
  oembed.searchParams.set('format', 'json');

  try {
    const res = await fetch(oembed, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      },
      signal,
    });
    if (!res.ok) return null;
    const data = await res.json() as { title?: unknown };
    const title = typeof data.title === 'string' ? data.title.trim() : '';
    return title || null;
  } catch {
    return null;
  }
}

function titleMatches(title: string, expectedKeywords: string[]): boolean {
  const lowered = title.toLowerCase();
  return expectedKeywords.every(k => lowered.includes(k));
}

async function validateAll(trailers: readonly Trailer[]) {
  const controller = new AbortController();
  const { signal } = controller;

  const results = await Promise.all(trailers.map(async (t) => {
    const title = await fetchOEmbedTitle(t.url, signal);
    if (!title) return { t, ok: false, title: null as string | null };
    const ok = titleMatches(title, t.expectedKeywords);
    return { t, ok, title };
  }));

  const valid = results.filter(r => r.ok).map(r => r.t.url);
  const invalid = results.filter(r => !r.ok).map(r => r.t.url);
  return { valid, invalid };
}

async function saveValid(urls: string[]): Promise<void> {
  const content = urls.join('\n') + (urls.length ? '\n' : '');
  await mkdir(dirname(OUTPUT_FILE), { recursive: true });
  await writeFile(OUTPUT_FILE, content, 'utf8');
}

async function main(): Promise<number> {
  const { valid, invalid } = await validateAll(TRAILERS);
  await saveValid(valid);

  // Print invalid URLs (one per line) to stdout, as requested
  if (invalid.length > 0) {
    console.error(`Saved ${valid.length} valid URLs to ${OUTPUT_FILE}. Invalid: ${invalid.length}`);
    for (const bad of invalid) console.log(bad);
  } else {
    console.error(`Saved ${valid.length} valid URLs to ${OUTPUT_FILE}. Invalid: 0`);
  }

  // Always exit 0 per requirement (no fail-on-invalid)
  return 0;
}

main().then((code) => {
  if (code !== 0) process.exit(code);
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
