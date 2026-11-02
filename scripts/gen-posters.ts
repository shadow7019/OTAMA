import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';
import path from 'path';

const POSTER_DIR = '/home/z/my-project/public/posters';
const BACKDROP_DIR = '/home/z/my-project/public/backdrops';

type Job = { slug: string; prompt: string; size: string; dir: string };

const STYLE_TAIL =
  ', cinematic movie poster key art, dramatic lighting, rich color grade, high quality, detailed illustration, no text, no words, no letters, no typography, no watermark';

const POSTERS: Job[] = [
  { slug: 'night-of-the-living-dead', size: '768x1344', dir: POSTER_DIR, prompt: 'Gritty 1960s horror film artwork: lone farmhouse silhouette at night under a full moon, shambling shadowy figures in a foggy field, desaturated sickly green and black palette, grainy analog film aesthetic' + STYLE_TAIL },
  { slug: 'plan-9-from-outer-space', size: '768x1344', dir: POSTER_DIR, prompt: 'Campy 1950s pulp B-movie sci-fi artwork: flying saucers hovering over a graveyard at night, beams of light, rising cardboard-looking tombstones, teal and orange palette, vintage pulp illustration' + STYLE_TAIL },
  { slug: 'the-cabinet-of-dr-caligari', size: '768x1344', dir: POSTER_DIR, prompt: 'German expressionist 1920s artwork: distorted crooked village with jagged angled buildings, a sleepwalker silhouette in dark striped clothing carrying a figure, harsh black white and pale green palette, woodcut expressionism' + STYLE_TAIL },
  { slug: 'sherlock-jr', size: '768x1344', dir: POSTER_DIR, prompt: 'Silent film comedy artwork: elegant silhouette of a man in a bowler hat stepping into a glowing film projector beam that becomes a dream scene, cream and black with soft sepia tint, 1920s art deco style, playful' + STYLE_TAIL },
  { slug: 'the-kid', size: '768x1344', dir: POSTER_DIR, prompt: 'Tender 1920s silent era artwork: a small tramp figure with cane walking down a city street holding hands with a tiny child in a sweater, warm sepia tones, whimsical vintage illustration' + STYLE_TAIL },
  { slug: 'metropolis', size: '768x1344', dir: POSTER_DIR, prompt: 'Art deco science fiction artwork: towering futuristic city with geometric skyscrapers and elevated roads, a giant angular robot figure with rays of light from its head, gold and deep crimson palette, 1927 deco futurism' + STYLE_TAIL },
  { slug: 'charade', size: '768x1344', dir: POSTER_DIR, prompt: 'Stylish 1960s thriller artwork: Paris rooftops and metro skyline, elegant silhouettes of a man in a suit and a glamorous woman, bold flat mid-century illustration, coral pink and charcoal palette with gold accents' + STYLE_TAIL },
  { slug: 'his-girl-friday', size: '768x1344', dir: POSTER_DIR, prompt: '1940s screwball comedy artwork: a chaotic press room with typewriters and flying newspapers, a man and a determined woman journalist facing each other, golden age illustration style, warm cream and deep red palette' + STYLE_TAIL },
  { slug: 'the-general', size: '768x1344', dir: POSTER_DIR, prompt: 'Silent era adventure comedy artwork: a steam locomotive crossing a wooden trestle bridge, a plucky engineer waving from the cab, sepia and umber tones, vintage 1920s illustration style' + STYLE_TAIL },
  { slug: 'nosferatu', size: '768x1344', dir: POSTER_DIR, prompt: 'Gothic horror artwork: a gaunt shadowy figure with elongated fingers and pointed ears ascending a stone staircase, dramatic light through a window, expressionist 1920s style, black and sickly green palette' + STYLE_TAIL },
  { slug: 'the-little-shop-of-horrors', size: '768x1344', dir: POSTER_DIR, prompt: 'Campy 1960s comedy horror artwork: a strange carnivorous plant in a flower pot looming in a dim florist shop, long dramatic shadow on the wall, retro pulp illustration, lurid green and pink palette' + STYLE_TAIL },
  { slug: 'gullivers-travels', size: '768x1344', dir: POSTER_DIR, prompt: 'Golden age animation artwork: a giant friendly young sailor standing on a shore looking at a tiny sailing ship, lush green island with palm trees, 1939 cel animation style, bright cheerful colors' + STYLE_TAIL },
  { slug: 'big-buck-bunny', size: '768x1344', dir: POSTER_DIR, prompt: 'Cheerful 3D cartoon artwork: a big fluffy gentle rabbit standing in a sunny meadow with butterflies, wildflowers and forest edge, vibrant greens and blue sky, polished modern animation render' + STYLE_TAIL },
  { slug: 'sintel', size: '768x1344', dir: POSTER_DIR, prompt: 'Epic fantasy animation artwork: a young wanderer with a staff and scarf standing on a snowy mountain ridge beside a small dragon, dramatic storm clouds, painterly stylized 3D animation, teal and amber palette' + STYLE_TAIL },
  { slug: 'elephants-dream', size: '768x1344', dir: POSTER_DIR, prompt: 'Surreal 3D animation artwork: two silhouetted figures inside a strange living machine world of doors, pipes and wires, dreamlike cyan and rust palette, abstract mechanical surrealism' + STYLE_TAIL },
  { slug: 'tears-of-steel', size: '768x1344', dir: POSTER_DIR, prompt: 'Science fiction VFX artwork: an old European bridge cityscape with a battle between a lone man and menacing robots, glowing energy effects and sparks, dramatic futuristic atmosphere, steel blue and orange' + STYLE_TAIL },
  { slug: 'cosmos-laundromat', size: '768x1344', dir: POSTER_DIR, prompt: 'Whimsical 3D animation artwork: a curious sheep standing on a rocky island cliff looking at a distant lighthouse, surreal colorful sky, stylized cartoon render, pastel and turquoise palette' + STYLE_TAIL },
  { slug: 'caminandes-llamigos', size: '768x1344', dir: POSTER_DIR, prompt: 'Cute 3D cartoon artwork: a small fluffy llama and a tiny penguin standing on a snowy patagonia road at sunset, playful winter scene, stylized animation render, warm pink and ice blue palette' + STYLE_TAIL },
  { slug: 'superman-mechanical-monsters', size: '768x1344', dir: POSTER_DIR, prompt: 'Golden age comic artwork: a caped hero flying over a 1940s city as giant mechanical robot machines stride through streets, retro fleischer art deco cartoon style, bold red gold and charcoal' + STYLE_TAIL },
  { slug: 'betty-boop-snow-white', size: '768x1344', dir: POSTER_DIR, prompt: 'Vintage 1930s cartoon artwork: a flapper cartoon girl in a surreal enchanted forest of dancing candle-like trees, rotoscope animation style, black and white with deep red accents, jazzy surreal mood' + STYLE_TAIL },
  { slug: 'popeye-the-paneless-window-washer', size: '768x1344', dir: POSTER_DIR, prompt: 'Vintage 1930s cartoon artwork: a squinting sailor with oversized forearms washing skyscraper windows high above a city, rubber hose animation style, bright cheerful colors' + STYLE_TAIL },
  { slug: 'the-dull-sword', size: '768x1344', dir: POSTER_DIR, prompt: 'Vintage Japanese animation artwork: a bumbling samurai cat in traditional Edo period street holding a newly bought sword, aged paper texture, retro 1910s Japanese cartoon style, muted ink and ochre palette' + STYLE_TAIL },
  { slug: 'momotaros-sea-eagles', size: '768x1344', dir: POSTER_DIR, prompt: 'Retro Japanese animation artwork: a young hero with a peach-pattern headband on an aircraft carrier deck surrounded by cheerful animal pilots in planes, 1940s Japanese cartoon style, sepia and rising sun red' + STYLE_TAIL },
  { slug: 'fox-and-tanuki', size: '768x1344', dir: POSTER_DIR, prompt: 'Vintage Japanese animation artwork: mischievous tanuki raccoon dog and fox spirits shapeshifting with glowing lanterns around a haunted temple, 1930s Japanese cartoon style, playful, aged paper texture' + STYLE_TAIL },
  { slug: 'benkei-vs-ushiwaka', size: '768x1344', dir: POSTER_DIR, prompt: 'Vintage Japanese animation artwork: a giant warrior monk with naginata facing a graceful young nobleman on an old wooden bridge at night, full moon reflection, 1930s Japanese cartoon style, dramatic ink palette' + STYLE_TAIL },
  { slug: 'sherlock-holmes-1954', size: '768x1344', dir: POSTER_DIR, prompt: '1950s TV detective series artwork: a gentleman detective in deerstalker cap with pipe standing on a foggy London street beside a gas lamp, hansom cab silhouette, mid-century illustration style, muted browns and greys' + STYLE_TAIL },
  { slug: 'one-step-beyond', size: '768x1344', dir: POSTER_DIR, prompt: 'Vintage mystery anthology series artwork: a misty Victorian mansion with an eerie glow in one window, a hypnotic spiral in the sky, late 1950s Twilight-era style, eerie grey and violet palette' + STYLE_TAIL },
  { slug: 'the-lucy-show', size: '768x1344', dir: POSTER_DIR, prompt: '1960s sitcom artwork: a cheerful redhead woman comically juggling hats in a department store aisle, mid-century cartoon illustration style, bright orange and teal palette, playful energy' + STYLE_TAIL },
  { slug: 'burns-and-allen', size: '768x1344', dir: POSTER_DIR, prompt: '1950s sitcom artwork: a vaudeville couple performing on stage, a man with a cigar and a glamorous woman in a fur stole, golden age Hollywood illustration style, warm sepia and rose palette' + STYLE_TAIL },
  { slug: 'the-beverly-hillbillies', size: '768x1344', dir: POSTER_DIR, prompt: '1960s sitcom artwork: a rusty old flatbed truck loaded with a rocking chair and barrels driving past palm trees toward a grand mansion, dust cloud behind, cartoonish mid-century style, bright California palette' + STYLE_TAIL },
];

const BACKDROPS: Job[] = [
  { slug: 'metropolis-wide', size: '1344x768', dir: BACKDROP_DIR, prompt: 'Wide cinematic art deco science fiction establishing shot: futuristic 1920s deco city with geometric skyscrapers, elevated roads and searchlights, gold and deep crimson palette, atmospheric' + STYLE_TAIL },
  { slug: 'night-of-the-living-dead-wide', size: '1344x768', dir: BACKDROP_DIR, prompt: 'Wide cinematic horror establishing shot: isolated farmhouse in a dark field under full moon, fog rolling over graves, shambling distant silhouettes, desaturated sickly green and black, grainy 1960s aesthetic' + STYLE_TAIL },
  { slug: 'sintel-wide', size: '1344x768', dir: BACKDROP_DIR, prompt: 'Wide cinematic fantasy animation establishing shot: a wanderer and a small dragon on a snowy mountain ridge at dusk, vast storm clouds, painterly stylized 3D, teal and amber palette' + STYLE_TAIL },
  { slug: 'charade-wide', size: '1344x768', dir: BACKDROP_DIR, prompt: 'Wide cinematic stylish 1960s thriller establishing shot: Paris skyline at dusk with metro and rooftops, elegant mysterious mood, coral pink and charcoal palette with gold accents' + STYLE_TAIL },
  { slug: 'big-buck-bunny-wide', size: '1344x768', dir: BACKDROP_DIR, prompt: 'Wide cinematic 3D cartoon establishing shot: a sunny lush meadow with giant oak tree, butterflies and forest edge, vibrant greens, polished modern animation render, family friendly' + STYLE_TAIL },
];

async function main() {
  const zai = await ZAI.create();
  const jobs = [...POSTERS, ...BACKDROPS];
  const onlyFailed = process.argv[2] === '--retry-failed';

  let pending: Job[] = jobs;
  if (onlyFailed) {
    pending = jobs.filter((j) => !fs.existsSync(path.join(j.dir, `${j.slug}.png`)));
  }
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  if (limitArg) {
    const n = Number(limitArg.split('=')[1]);
    if (Number.isFinite(n) && n > 0) pending = pending.slice(0, n);
  }

  console.log(`Generating ${pending.length} images with concurrency 2 (rate-limit friendly)...`);
  const queue = [...pending];
  const results: { slug: string; ok: boolean; err?: string }[] = [];

  async function worker(id: number) {
    while (queue.length) {
      const job = queue.shift();
      if (!job) break;
      const out = path.join(job.dir, `${job.slug}.png`);
      for (let attempt = 1; attempt <= 8; attempt++) {
        try {
          const res = await zai.images.generations.create({ prompt: job.prompt, size: job.size });
          const b64 = res?.data?.[0]?.base64;
          if (!b64) throw new Error('empty base64');
          fs.writeFileSync(out, Buffer.from(b64, 'base64'));
          results.push({ slug: job.slug, ok: true });
          console.log(`[w${id}] OK ${job.slug} (${queue.length} left)`);
          break;
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          if (attempt === 8) {
            results.push({ slug: job.slug, ok: false, err: msg });
            console.error(`[w${id}] FAIL ${job.slug}: ${msg}`);
          } else {
            const wait = msg.includes('429') ? Math.min(25000 * attempt, 60000) : 3000 * attempt;
            console.log(`[w${id}] retry ${attempt} for ${job.slug} in ${wait / 1000}s (${msg.slice(0, 80)})`);
            await new Promise((r) => setTimeout(r, wait));
          }
        }
      }
    }
  }

  await Promise.all([worker(1), worker(2)]);

  const failed = results.filter((r) => !r.ok);
  console.log(`\nDone. OK: ${results.length - failed.length}/${pending.length}`);
  if (failed.length) {
    console.log('Failed slugs:', failed.map((f) => `${f.slug} (${f.err})`).join('; '));
    process.exitCode = 2;
  }
}

main();
